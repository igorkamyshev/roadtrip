import { describe, expect, test, vi } from 'vitest';

import { logger } from './logger';
import { traceToExceptions, type ExceptionEvent } from './trace-to-exceptions';

const BOT_TOKEN = '1234567890:AAHkKf83jspq02mfDs83hfk39fkKsl39fk3';
const T0 = Date.parse('2026-11-04T10:00:00.000Z');

// workerd cuts the "Name: message" header off stacks in a TraceItem: only frame lines are left
const WORKER_STACK = [
	'    at handleUpdate (index.js:120:15)',
	'    at Composer.handler (node_modules/.pnpm/grammy@1.45.0/node_modules/grammy/out/composer.js:10:5)',
	'    at async Object.fetch (index.js:300:7)',
].join('\n');

function fetchEvent(method: string, url: string): TraceItemFetchEventInfo {
	const request: TraceItemFetchEventInfoRequest = { headers: {}, method, url, getUnredacted: () => request };
	return { request, response: { status: 500 } };
}

function traceItem(overrides: Partial<TraceItem> = {}): TraceItem {
	return {
		event: fetchEvent('POST', 'https://ytc.kamyshev.me/webhook'),
		eventTimestamp: T0,
		logs: [],
		exceptions: [],
		diagnosticsChannelEvents: [],
		scriptName: 'ytc-telegram-bot',
		entrypoint: 'default',
		scriptVersion: { id: 'v-123' },
		outcome: 'ok',
		executionModel: 'stateless',
		truncated: false,
		cpuTime: 5,
		wallTime: 50,
		...overrides,
	};
}

function errorLog(message: unknown[], errorInfo?: (TraceLogErrorInfo | null)[]): TraceLog {
	return { timestamp: T0 + 1, level: 'error', message, errorInfo };
}

// Runs `fn` and returns its console.error calls as the runtime puts them in a
// TraceLog: Error arguments as "Name: message" text plus errorInfo, the rest as JSON.
function capturedErrorLogs(fn: () => void): TraceLog[] {
	const logs: TraceLog[] = [];
	const consoleError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		const errorInfo = args.map((arg) =>
			arg instanceof Error ? { name: arg.name, message: arg.message, stack: arg.stack?.split('\n').slice(1).join('\n') } : null,
		);
		const message = args.map((arg): unknown => (arg instanceof Error ? String(arg) : JSON.parse(JSON.stringify(arg))));
		logs.push(errorLog(message, errorInfo));
	});
	try {
		fn();
	} finally {
		consoleError.mockRestore();
	}
	return logs;
}

function onlyEvent(events: ExceptionEvent[]): ExceptionEvent {
	expect(events).toHaveLength(1);
	const event = events.at(0);
	if (event === undefined) {
		throw new Error('expected one event');
	}
	return event;
}

function firstException(event: ExceptionEvent) {
	const exception = event.properties.$exception_list.at(0);
	if (exception === undefined) {
		throw new Error('expected $exception_list');
	}
	return exception;
}

describe('traceToExceptions', () => {
	test('an unhandled exception is a $exception with a parsed stack and the worker context', () => {
		const event = onlyEvent(
			traceToExceptions(
				traceItem({
					outcome: 'exception',
					exceptions: [{ timestamp: T0 + 2, name: 'TypeError', message: 'Cannot read properties of undefined', stack: WORKER_STACK }],
				}),
			),
		);

		expect(event).toMatchObject({
			event: '$exception',
			timestamp: new Date(T0 + 2).toISOString(),
			properties: {
				worker: 'ytc-telegram-bot',
				entrypoint: 'default',
				execution_model: 'stateless',
				outcome: 'exception',
				release: 'v-123',
				trigger: 'POST /webhook',
				environment: 'production',
				$process_person_profile: false,
			},
		});
		// Without a userId the event is personless: a one-off distinct_id
		expect(event.distinct_id).toBe(event.uuid);

		const exception = firstException(event);
		expect(exception).toMatchObject({ type: 'TypeError', value: 'Cannot read properties of undefined', mechanism: { handled: false } });
		const frames = exception.stacktrace?.frames ?? [];
		expect(frames).toHaveLength(3);
		expect(frames.find((f) => f.function === 'handleUpdate')).toMatchObject({ filename: 'index.js', lineno: 120, colno: 15, in_app: true });
		expect(frames.find((f) => f.function === 'Composer.handler')?.in_app).toBe(false);
	});

	test('an error log with an Error argument: type and stack from errorInfo, the rest of the text in log_message', () => {
		const event = onlyEvent(
			traceToExceptions(
				traceItem({
					logs: [
						errorLog(
							['[webhook] dispatch failed update_id=42', 'Error: boom'],
							[null, { name: 'Error', message: 'boom', stack: WORKER_STACK }],
						),
					],
				}),
			),
		);

		expect(firstException(event)).toMatchObject({ type: 'Error', value: 'boom', mechanism: { handled: true } });
		expect(event.properties.log_message).toBe('[webhook] dispatch failed update_id=42');
		expect(event.timestamp).toBe(new Date(T0 + 1).toISOString());
	});

	test('logger.error ties the error to the User and sends the other context fields', () => {
		class DownloadError extends Error {
			name = 'DownloadError';
		}
		const logs = capturedErrorLogs(() => {
			logger.error('[workflow] download failed', new DownloadError('yt-dlp: Sign in to confirm'), {
				userId: 115658593,
				reason: 'bot_check',
				attempt: 2,
			});
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe('115658593');
		expect(event.properties).not.toHaveProperty('$process_person_profile');
		expect(event.properties).toMatchObject({ log_message: '[workflow] download failed', reason: 'bot_check', attempt: 2 });
		expect(firstException(event)).toMatchObject({
			type: 'DownloadError',
			value: 'yt-dlp: Sign in to confirm',
			mechanism: { handled: true },
		});
		expect(firstException(event).stacktrace?.frames?.length).toBeGreaterThan(0);
	});

	test('context fields never override what the worker reports about the run', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('boom', undefined, { outcome: 'fake', worker: 'fake' });
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.properties).toMatchObject({ outcome: 'ok', worker: 'ytc-telegram-bot' });
	});

	test('an error log without an Error argument is a LoggedError with the log text', () => {
		const event = onlyEvent(traceToExceptions(traceItem({ logs: [errorLog(['[cron] invalid PostHog answer', { issues: [] }])] })));

		expect(firstException(event)).toMatchObject({
			type: 'LoggedError',
			value: '[cron] invalid PostHog answer',
			mechanism: { handled: true },
		});
		expect(firstException(event).stacktrace).toBeUndefined();
		expect(event.properties).not.toHaveProperty('log_message');
	});

	test('info and warn are not errors', () => {
		expect(
			traceToExceptions(
				traceItem({
					logs: [
						{ timestamp: T0, level: 'info', message: ['ok'] },
						{ timestamp: T0, level: 'warn', message: ['slow'] },
					],
				}),
			),
		).toEqual([]);
	});

	test('a run that ended ok without exceptions is not an error', () => {
		expect(traceToExceptions(traceItem({ outcome: 'ok' }))).toEqual([]);
	});

	test.each(['exceededCpu', 'exceededMemory', 'canceled'])(
		'a run that ended with %s is a synthetic exception typed as the outcome',
		(outcome) => {
			const event = onlyEvent(traceToExceptions(traceItem({ outcome })));

			expect(firstException(event)).toMatchObject({
				type: outcome,
				value: `Invocation ended with outcome ${outcome}`,
				mechanism: { handled: false, synthetic: true },
			});
		},
	);

	// Worked examples from PostHog project 227415. 2026-11-05 06:46:36Z: the container's alarm ended
	// canceled as finishJob stopped it, and 0.6 s later the Episode was ready. 2026-11-04 19:02–19:09:
	// the Workflow's runs ended canceled at the backoff and while waiting for the job's result.
	const containerAlarm = {
		scriptName: 'ytc-yt-downloader',
		entrypoint: 'YouTubeDLContainer',
		executionModel: 'durableObject',
		durableObjectId: 'do-1',
		event: { scheduledTime: new Date(T0) },
	} satisfies Partial<TraceItem>;
	const workflowRun = {
		scriptName: 'ytc-telegram-bot',
		entrypoint: 'EpisodeWorkflow',
		executionModel: 'stateless',
		event: { rpcMethod: 'run' },
	} satisfies Partial<TraceItem>;

	test.each<[string, Partial<TraceItem>]>([
		['the container Durable Object alarm (finishJob stops the container after each job)', containerAlarm],
		['an EpisodeWorkflow run (the engine pauses the instance at a sleep or a wait)', workflowRun],
	])('%s that ends canceled is not an error', (_kind, run) => {
		expect(traceToExceptions(traceItem({ ...run, outcome: 'canceled' }))).toEqual([]);
	});

	test('an error logged in a canceled EpisodeWorkflow run is sent without a synthetic exception', () => {
		const failure = Object.assign(new Error('Credential access key has length 64'), { name: 'EpisodeDownloadError' });
		const logs = capturedErrorLogs(() => {
			logger.error('A download attempt of an Episode failed', failure, {
				userId: 42,
				episodeId: 'ep1',
				reason: 'other',
			});
		});

		const event = onlyEvent(traceToExceptions(traceItem({ ...workflowRun, outcome: 'canceled', logs })));

		expect(firstException(event)).toMatchObject({ type: 'EpisodeDownloadError', mechanism: { handled: true } });
		expect(event.properties).toMatchObject({ outcome: 'canceled', trigger: 'rpc run', reason: 'other' });
	});

	test.each<[string, Partial<TraceItem>]>([
		['a request to the bot', {}],
		['an RPC into the container Durable Object', { ...containerAlarm, event: { rpcMethod: 'startJob' } }],
		['an alarm of another Durable Object', { ...containerAlarm, scriptName: 'ytc-telegram-bot', entrypoint: 'FlueAssistantAgent' }],
		['a run of another Workflow', { ...workflowRun, entrypoint: 'OtherWorkflow' }],
	])('%s that ends canceled is still a synthetic exception', (_kind, run) => {
		const event = onlyEvent(traceToExceptions(traceItem({ ...run, outcome: 'canceled' })));

		expect(firstException(event)).toMatchObject({ type: 'canceled', mechanism: { handled: false, synthetic: true } });
	});

	test.each<[string, Partial<TraceItem>]>([
		['the container Durable Object alarm', containerAlarm],
		['an EpisodeWorkflow run', workflowRun],
	])('%s that ran out of CPU is still a synthetic exception', (_kind, run) => {
		const event = onlyEvent(traceToExceptions(traceItem({ ...run, outcome: 'exceededCpu' })));

		expect(firstException(event)).toMatchObject({ type: 'exceededCpu', mechanism: { synthetic: true } });
	});

	test('logged and rethrown is one unhandled event', () => {
		const event = onlyEvent(
			traceToExceptions(
				traceItem({
					outcome: 'exception',
					exceptions: [{ timestamp: T0, name: 'Error', message: 'D1 is down' }],
					logs: [errorLog(['Error: D1 is down'], [{ name: 'Error', message: 'D1 is down' }])],
				}),
			),
		);

		expect(firstException(event).mechanism?.handled).toBe(false);
	});

	test('logged with a userId and rethrown keeps the User, the log text and the context', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('[workflow] failed', new Error('D1 is down'), { userId: 42, episodeId: 'ep1' });
		});

		const event = onlyEvent(
			traceToExceptions(traceItem({ outcome: 'exception', exceptions: [{ timestamp: T0, name: 'Error', message: 'D1 is down' }], logs })),
		);

		expect(event.distinct_id).toBe('42');
		expect(event.properties).toMatchObject({ log_message: '[workflow] failed', episodeId: 'ep1' });
		expect(firstException(event).mechanism?.handled).toBe(false);
	});

	test('the bot token is removed from the message and the path, the query string is not sent', () => {
		const event = onlyEvent(
			traceToExceptions(
				traceItem({
					event: fetchEvent('GET', `https://api.example/bot${BOT_TOKEN}/getFile?secret=hook-secret`),
					logs: [errorLog([`getFile failed for bot${BOT_TOKEN}`])],
				}),
			),
		);

		const serialized = JSON.stringify(event);
		expect(serialized).not.toContain(BOT_TOKEN);
		expect(serialized).not.toContain('hook-secret');
		expect(event.properties.trigger).toBe('GET /bot[redacted]/getFile');
	});

	test('keys are removed from messages, stacks and context', () => {
		const secrets = {
			anthropic: 'sk-ant-api03-Zx8Qm2Lp9Vr4Ty7Wn1Bh6Cf0Ds5Ae3Gk',
			openRouter: 'sk-or-v1-4f9a2c7e1b8d3f6a0c5e9b2d7f1a4c8e',
			posthog: 'phc_k3J9xQ2mZpL8vR4tY7wN1bH6cF0dS5aE',
			r2Secret: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
			jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
			password: 'hunter2-hunter2',
		};
		const leakyStack = `    at fetch (https://api.example/bot${BOT_TOKEN}/send:1:1)`;
		const events = traceToExceptions(
			traceItem({
				outcome: 'exception',
				exceptions: [{ timestamp: T0, name: 'Error', message: `401 invalid x-api-key ${secrets.anthropic}`, stack: leakyStack }],
				logs: [
					errorLog(
						[
							`model call failed, Authorization: Bearer ${secrets.jwt}`,
							{ reason: `key ${secrets.openRouter}`, password: secrets.password },
							'Error: x',
						],
						[null, null, { name: 'S3Error', message: `bad secret ${secrets.r2Secret} for ${secrets.posthog}`, stack: leakyStack }],
					),
				],
			}),
		);

		expect(events).toHaveLength(2);
		const serialized = JSON.stringify(events);
		expect(serialized).not.toContain(BOT_TOKEN);
		for (const secret of Object.values(secrets)) {
			expect(serialized).not.toContain(secret);
		}
	});

	test('long messages are cut', () => {
		const event = onlyEvent(traceToExceptions(traceItem({ logs: [errorLog(['x'.repeat(10_000)])] })));

		expect(String(firstException(event).value).length).toBeLessThanOrEqual(2_001);
	});

	test('the uuid is stable for one run and differs between events', () => {
		const item = traceItem({ logs: [errorLog(['first failure']), errorLog(['second failure'])] });

		const first = traceToExceptions(item).map((e) => e.uuid);
		const second = traceToExceptions(item).map((e) => e.uuid);

		expect(first).toEqual(second);
		expect(new Set(first).size).toBe(2);
		for (const uuid of first) {
			expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
		}

		// The same error in another DO in the same millisecond is another event
		const otherObject = traceToExceptions({ ...item, durableObjectId: 'do-2' }).map((e) => e.uuid);
		expect(otherObject[0]).not.toBe(first[0]);
	});

	test.each<[string, TraceItem['event'], string]>([
		['a cron', { cron: '*/5 * * * *', scheduledTime: T0 }, 'cron */5 * * * *'],
		['a queue', { queue: 'ytc-video-ids', batchSize: 1 }, 'queue ytc-video-ids'],
		['RPC', { rpcMethod: 'startJob' }, 'rpc startJob'],
		['a DO alarm', { scheduledTime: new Date(T0) }, 'alarm'],
		['a WebSocket message', { getWebSocketEvent: { webSocketEventType: 'message' } }, 'websocket message'],
	])('the trigger describes %s', (_kind, event, trigger) => {
		const result = onlyEvent(traceToExceptions(traceItem({ event, logs: [errorLog(['boom'])] })));

		expect(result.properties.trigger).toBe(trigger);
	});
});
