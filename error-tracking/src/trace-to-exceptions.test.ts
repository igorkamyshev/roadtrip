import { describe, expect, test, vi } from 'vitest';

import { logger } from './logger';
import { traceToExceptions, type ExceptionEvent } from './trace-to-exceptions';

const T0 = Date.parse('2026-11-04T10:00:00.000Z');
// posthog-js ids, as the browser sends them in X-POSTHOG-DISTINCT-ID and X-POSTHOG-SESSION-ID (UUIDv7)
const BROWSER_ID = '019a5d2c-7f3e-7b1a-9c4d-2e6f8a0b1c3d';
const SESSION_ID = '019a5d2c-8a41-7e02-b5c6-d7e8f9a0b1c2';
const RING_URL = 'https://roadtrip.kamyshev.me/api/ring?lat=44.8125&lon=20.4612&hours=6&citizenships=RUS';

// workerd cuts the "Name: message" header off stacks in a TraceItem: only frame lines are left
const WORKER_STACK = [
	'    at handleRing (index.js:120:15)',
	'    at PostHog.captureImmediate (node_modules/.pnpm/posthog-node@5.63.1/node_modules/posthog-node/dist/edge/index.mjs:10:5)',
	'    at async Object.fetch (index.js:300:7)',
].join('\n');

function fetchEvent(method: string, url: string): TraceItemFetchEventInfo {
	const request: TraceItemFetchEventInfoRequest = { headers: {}, method, url, getUnredacted: () => request };
	return { request, response: { status: 500 } };
}

function traceItem(overrides: Partial<TraceItem> = {}): TraceItem {
	return {
		event: fetchEvent('GET', RING_URL),
		eventTimestamp: T0,
		logs: [],
		exceptions: [],
		diagnosticsChannelEvents: [],
		scriptName: 'roadtrip',
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

// A request that no expected cancellation covers
const otherRequest = { event: fetchEvent('GET', 'https://roadtrip.kamyshev.me/api/other') } satisfies Partial<TraceItem>;

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
				worker: 'roadtrip',
				entrypoint: 'default',
				execution_model: 'stateless',
				outcome: 'exception',
				release: 'v-123',
				trigger: 'GET /api/ring',
				environment: 'production',
				$process_person_profile: false,
			},
		});
		// Without a distinct_id the event is personless: a one-off distinct_id
		expect(event.distinct_id).toBe(event.uuid);

		const exception = firstException(event);
		expect(exception).toMatchObject({ type: 'TypeError', value: 'Cannot read properties of undefined', mechanism: { handled: false } });
		const frames = exception.stacktrace?.frames ?? [];
		expect(frames).toHaveLength(3);
		expect(frames.find((f) => f.function === 'handleRing')).toMatchObject({ filename: 'index.js', lineno: 120, colno: 15, in_app: true });
		expect(frames.find((f) => f.function === 'PostHog.captureImmediate')?.in_app).toBe(false);
	});

	test('an error log with an Error argument: type and stack from errorInfo, the rest of the text in log_message', () => {
		const event = onlyEvent(
			traceToExceptions(
				traceItem({
					logs: [
						errorLog(
							['[ring] the engine failed hours=6', 'Error: boom'],
							[null, { name: 'Error', message: 'boom', stack: WORKER_STACK }],
						),
					],
				}),
			),
		);

		expect(firstException(event)).toMatchObject({ type: 'Error', value: 'boom', mechanism: { handled: true } });
		expect(event.properties.log_message).toBe('[ring] the engine failed hours=6');
		expect(event.timestamp).toBe(new Date(T0 + 1).toISOString());
	});

	test('logger.error ties the error to the browser by distinct_id and session_id and sends the other context fields', () => {
		class SherpaError extends Error {
			name = 'SherpaError';
		}
		const logs = capturedErrorLogs(() => {
			logger.error('[sherpa] refresh failed, served the stale copy', new SherpaError('Sherpa answered HTTP 503'), {
				distinct_id: BROWSER_ID,
				session_id: SESSION_ID,
				reason: '503',
				citizenship: 'RUS',
				served: 'stale',
			});
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe(BROWSER_ID);
		expect(event.properties).toMatchObject({
			$session_id: SESSION_ID,
			// The browser's person is anonymous, and no Worker event makes one (spec «Аналитика и ошибки»)
			$process_person_profile: false,
			log_message: '[sherpa] refresh failed, served the stale copy',
			reason: '503',
			citizenship: 'RUS',
			served: 'stale',
		});
		expect(event.properties).not.toHaveProperty('distinct_id');
		expect(event.properties).not.toHaveProperty('session_id');
		expect(firstException(event)).toMatchObject({
			type: 'SherpaError',
			value: 'Sherpa answered HTTP 503',
			mechanism: { handled: true },
		});
		expect(firstException(event).stacktrace?.frames?.length).toBeGreaterThan(0);
	});

	test('without a distinct_id the event gets a one-off distinct_id and creates no person; the session still links it', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('[ring] the engine failed', new Error('boom'), { session_id: SESSION_ID });
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe(event.uuid);
		expect(event.properties).toMatchObject({ $session_id: SESSION_ID, $process_person_profile: false });
	});

	test('without a session_id the event has no $session_id', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('[ring] the engine failed', new Error('boom'), { distinct_id: BROWSER_ID });
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe(BROWSER_ID);
		expect(event.properties).not.toHaveProperty('$session_id');
	});

	test.each<[string, Record<string, unknown>]>([
		['not strings', { distinct_id: 42, session_id: { id: SESSION_ID } }],
		['empty', { distinct_id: '', session_id: '' }],
		['only control characters', { distinct_id: '\n\t', session_id: '\u0000' }],
	])('a distinct_id and session_id that are %s are ignored', (_kind, context) => {
		const logs = capturedErrorLogs(() => {
			logger.error('boom', undefined, context);
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe(event.uuid);
		expect(event.properties).not.toHaveProperty('$session_id');
		expect(event.properties).not.toHaveProperty('distinct_id');
		expect(event.properties).not.toHaveProperty('session_id');
	});

	test('control characters are removed from distinct_id and session_id', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('boom', undefined, { distinct_id: `${BROWSER_ID}\r\n`, session_id: `\u0000${SESSION_ID}` });
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.distinct_id).toBe(BROWSER_ID);
		expect(event.properties.$session_id).toBe(SESSION_ID);
	});

	test('context fields never override what the worker reports about the run', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('boom', undefined, { outcome: 'fake', worker: 'fake' });
		});

		const event = onlyEvent(traceToExceptions(traceItem({ logs })));

		expect(event.properties).toMatchObject({ outcome: 'ok', worker: 'roadtrip' });
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
			const event = onlyEvent(traceToExceptions(traceItem({ ...otherRequest, outcome })));

			expect(firstException(event)).toMatchObject({
				type: outcome,
				value: `Invocation ended with outcome ${outcome}`,
				mechanism: { handled: false, synthetic: true },
			});
		},
	);

	// Runs of the roadtrip Worker that end canceled on a normal day (EXPECTED_CANCELLATIONS)
	const containerAlarm = {
		entrypoint: 'EngineContainer',
		executionModel: 'durableObject',
		durableObjectId: 'do-1',
		event: { scheduledTime: new Date(T0) },
	} satisfies Partial<TraceItem>;
	const ringRequest = { event: fetchEvent('GET', RING_URL) } satisfies Partial<TraceItem>;
	const tileRequest = { event: fetchEvent('GET', 'https://roadtrip.kamyshev.me/tiles/6/35/22') } satisfies Partial<TraceItem>;

	test.each<[string, Partial<TraceItem>]>([
		['the EngineContainer alarm (@cloudflare/containers stops the container after sleepAfter or for a new image)', containerAlarm],
		['a ring request the person left before the answer', ringRequest],
		['a tile request MapLibre dropped as the map moved', tileRequest],
	])('%s that ends canceled is not an error', (_kind, run) => {
		expect(traceToExceptions(traceItem({ ...run, outcome: 'canceled' }))).toEqual([]);
	});

	test('an error logged in a canceled ring request is sent without a synthetic exception', () => {
		class SherpaError extends Error {
			name = 'SherpaError';
		}
		const logs = capturedErrorLogs(() => {
			logger.error('[sherpa] request failed, served the stale copy', new SherpaError('Sherpa timed out'), {
				distinct_id: BROWSER_ID,
				reason: 'timeout',
				served: 'stale',
			});
		});

		const event = onlyEvent(traceToExceptions(traceItem({ ...ringRequest, outcome: 'canceled', logs })));

		expect(firstException(event)).toMatchObject({ type: 'SherpaError', mechanism: { handled: true } });
		expect(event.properties).toMatchObject({ outcome: 'canceled', trigger: 'GET /api/ring', reason: 'timeout' });
	});

	test.each<[string, Partial<TraceItem>]>([
		['another request to the Worker', otherRequest],
		['an RPC into the EngineContainer', { ...containerAlarm, event: { rpcMethod: 'calculate' } }],
		['an alarm of another Durable Object', { ...containerAlarm, entrypoint: 'OtherObject' }],
		['a ring request of another worker', { ...ringRequest, scriptName: 'other-worker' }],
	])('%s that ends canceled is still a synthetic exception', (_kind, run) => {
		const event = onlyEvent(traceToExceptions(traceItem({ ...run, outcome: 'canceled' })));

		expect(firstException(event)).toMatchObject({ type: 'canceled', mechanism: { handled: false, synthetic: true } });
	});

	test.each<[string, Partial<TraceItem>]>([
		['the EngineContainer alarm', containerAlarm],
		['a ring request', ringRequest],
		['a tile request', tileRequest],
	])('%s that ran out of CPU is still a synthetic exception', (_kind, run) => {
		const event = onlyEvent(traceToExceptions(traceItem({ ...run, outcome: 'exceededCpu' })));

		expect(firstException(event)).toMatchObject({ type: 'exceededCpu', mechanism: { synthetic: true } });
	});

	test('a canceled ring request whose waitUntil work the runtime cut off is still a synthetic exception', () => {
		// The background Sherpa refresh and the PostHog sends run in waitUntil, which gets 30 s after
		// the person leaves; past that the runtime cancels it and logs this line (Workers docs, «Context»)
		const cutOff: TraceLog = {
			timestamp: T0 + 30_000,
			level: 'warn',
			message: ['waitUntil() tasks did not complete within the allowed time after invocation end and have been cancelled.'],
		};

		const event = onlyEvent(traceToExceptions(traceItem({ ...ringRequest, outcome: 'canceled', logs: [cutOff] })));

		expect(firstException(event)).toMatchObject({ type: 'canceled', mechanism: { handled: false, synthetic: true } });
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

	test('logged with a distinct_id and session_id and rethrown keeps them, the log text and the context', () => {
		const logs = capturedErrorLogs(() => {
			logger.error('[ring] KV read failed', new Error('KV is down'), { distinct_id: BROWSER_ID, session_id: SESSION_ID, hours: 6 });
		});

		const event = onlyEvent(
			traceToExceptions(traceItem({ outcome: 'exception', exceptions: [{ timestamp: T0, name: 'Error', message: 'KV is down' }], logs })),
		);

		expect(event.distinct_id).toBe(BROWSER_ID);
		expect(event.properties).toMatchObject({ $session_id: SESSION_ID, log_message: '[ring] KV read failed', hours: 6 });
		expect(firstException(event).mechanism?.handled).toBe(false);
	});

	test('only the path of a request is sent: the start point in its query string never reaches PostHog', () => {
		const event = onlyEvent(traceToExceptions(traceItem({ logs: [errorLog(['[ring] the engine failed'])] })));

		expect(event.properties.trigger).toBe('GET /api/ring');
		const serialized = JSON.stringify(event);
		expect(serialized).not.toContain('44.8125');
		expect(serialized).not.toContain('20.4612');
		expect(serialized).not.toContain('roadtrip.kamyshev.me');
	});

	test('keys are removed from messages, stacks and context', () => {
		const secrets = {
			posthogPersonal: 'phx_Zx8Qm2Lp9Vr4Ty7Wn1Bh6Cf0Ds5Ae3Gk',
			apiKey: 'sk-or-v1-4f9a2c7e1b8d3f6a0c5e9b2d7f1a4c8e',
			posthog: 'phc_k3J9xQ2mZpL8vR4tY7wN1bH6cF0dS5aE',
			urlKey: 'AIzaSyD3x9Lk2Qw8Er5Ty7Ui1Op4As6Df8Gh0J',
			r2Secret: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
			jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
			password: 'hunter2-hunter2',
		};
		const leakyStack = `    at fetch (https://api.example/v3/trips?key=${secrets.urlKey}:1:1)`;
		const events = traceToExceptions(
			traceItem({
				outcome: 'exception',
				exceptions: [{ timestamp: T0, name: 'Error', message: `401 invalid personal key ${secrets.posthogPersonal}`, stack: leakyStack }],
				logs: [
					errorLog(
						[
							`request failed, Authorization: Bearer ${secrets.jwt}`,
							{ reason: `key ${secrets.apiKey}`, password: secrets.password },
							'Error: x',
						],
						[null, null, { name: 'S3Error', message: `bad secret ${secrets.r2Secret} for ${secrets.posthog}`, stack: leakyStack }],
					),
				],
			}),
		);

		expect(events).toHaveLength(2);
		const serialized = JSON.stringify(events);
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
		['a queue', { queue: 'roadtrip-jobs', batchSize: 1 }, 'queue roadtrip-jobs'],
		['RPC', { rpcMethod: 'calculate' }, 'rpc calculate'],
		['a DO alarm', { scheduledTime: new Date(T0) }, 'alarm'],
		['a WebSocket message', { getWebSocketEvent: { webSocketEventType: 'message' } }, 'websocket message'],
	])('the trigger describes %s', (_kind, event, trigger) => {
		const result = onlyEvent(traceToExceptions(traceItem({ event, logs: [errorLog(['boom'])] })));

		expect(result.properties.trigger).toBe(trigger);
	});
});
