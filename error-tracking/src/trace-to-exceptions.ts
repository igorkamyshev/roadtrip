import { ErrorTracking } from '@posthog/core';
import { v5 as uuidV5 } from 'uuid';

import { scrubContextValue, scrubString } from './scrub';

// What in a TraceItem counts as an error (after numon's apps/error-tracking):
// 1. Each exceptions[] entry is an unhandled exception (handled: false).
// 2. Each error log is a handled error (handled: true): type, message and stack
//    from errorInfo; without an Error argument, a LoggedError with the log text.
// 3. A run whose outcome is not ok, with empty exceptions[], is a synthetic
//    exception typed as the outcome, except a `canceled` run of those that end
//    so on a normal run too (EXPECTED_CANCELLATIONS).
// 4. The same (type, message) within one run is one event: "log and rethrow"
//    is not doubled, and the User, log text and context move to the event kept.

export type ExceptionEvent = Readonly<{
	event: '$exception';
	uuid: string;
	distinct_id: string;
	timestamp?: string;
	properties: ExceptionEventProperties & LogFields;
}>;

type ExceptionEventProperties = Readonly<{
	$lib: 'roadtrip-error-tracking';
	environment: 'production';
	worker: string;
	entrypoint?: string;
	execution_model: string;
	outcome: string;
	release?: string;
	trigger?: string;
	$exception_level?: ErrorTracking.SeverityLevel;
	$exception_list: ErrorTracking.Exception[];
	$process_person_profile?: false;
	log_message?: string;
}>;

/** Primitive fields of the logger.error context other than userId. */
type LogFields = Readonly<Record<string, unknown>>;

type ErrorShape = Readonly<{ name: string; message: string; stack?: string }>;

type Candidate = Readonly<{
	error: ErrorShape;
	handled: boolean;
	synthetic?: boolean;
	timestamp: number | null;
	userId?: string;
	logMessage?: string;
	fields?: LogFields;
}>;

const MAX_TEXT_LENGTH = 2_000;
const MAX_CONTEXT_FIELDS = 20;

/** A worker's entrypoint and trigger, as the event's `worker`, `entrypoint` and `trigger` name them. */
type ExpectedCancellation = Readonly<{ worker: string; entrypoint: string; trigger: string }>;

// Runs whose `canceled` is no error: they end so on a normal run (PostHog and
// Cloudflare's invocation log, November 2026), and a failure in them reaches
// PostHog as its own exception or error log. Any other run cut off midway, such
// as a request to the bot, is still a synthetic exception. Durable Object
// migrations and the Workflow binding pin these class names.
const EXPECTED_CANCELLATIONS: readonly ExpectedCancellation[] = [
	// @cloudflare/containers keeps the container's Durable Object awake with a
	// loop of alarms. finishJob stops the container at the end of every job,
	// successful or not, and one alarm then ends canceled (about 100 ms, no CPU).
	// A container that dies during a job is reported by onStop or onError, a lost
	// job by the Workflow's watchdog.
	{ worker: 'ytc-yt-downloader', entrypoint: 'YouTubeDLContainer', trigger: 'alarm' },
	// The Workflows engine pauses an instance at step.sleep (backoff-<n>) or
	// step.waitForEvent by cancelling its `run`, then replays it in a new one. A
	// failed download attempt or step is logged, and a run that fails throws.
	{ worker: 'ytc-telegram-bot', entrypoint: 'EpisodeWorkflow', trigger: 'rpc run' },
];

// uuid v5 namespace of the events. Never change it: PostHog drops an event
// whose uuid it has seen, which is what makes a resend harmless
const EVENT_UUID_NAMESPACE = '6f1c4a8e-3b2d-4e5f-9a7c-1d2e3f4a5b6c';

// The same $exception_list builder as posthog-node's edge build
const errorPropertiesBuilder = new ErrorTracking.ErrorPropertiesBuilder(
	[new ErrorTracking.ErrorCoercer()],
	ErrorTracking.createStackParser('node:javascript', ErrorTracking.nodeStackLineParser),
);

export function traceToExceptions(item: TraceItem): ExceptionEvent[] {
	const candidates = [
		...item.exceptions.map((exception): Candidate => ({ error: exception, handled: false, timestamp: exception.timestamp })),
		...item.logs.flatMap(errorLogToCandidates),
		...failedOutcomeCandidates(item),
	];

	// The error, handled and time come from the first candidate (unhandled
	// exceptions come before logs); User, log text and context from the first
	// that has them
	const merged = new Map<string, Candidate>();
	for (const candidate of candidates) {
		const error = sanitizeError(candidate.error);
		const key = `${error.name}\u0000${error.message}`;
		const existing = merged.get(key);
		merged.set(
			key,
			existing
				? {
						...existing,
						userId: existing.userId ?? candidate.userId,
						logMessage: existing.logMessage ?? candidate.logMessage,
						fields: { ...candidate.fields, ...existing.fields },
					}
				: { ...candidate, error },
		);
	}

	const base = baseProperties(item);
	return [...merged.entries()].map(([key, candidate], index) => {
		// Everything that tells runs apart: two runs of one script in the same
		// millisecond (a worker and the DO it called) must not merge
		const uuid = uuidV5(
			[
				item.scriptName,
				item.scriptVersion?.id,
				item.entrypoint,
				item.executionModel,
				item.durableObjectId,
				item.eventTimestamp,
				index,
				candidate.timestamp,
				key,
			].join('|'),
			EVENT_UUID_NAMESPACE,
		);
		return {
			event: '$exception',
			uuid,
			distinct_id: candidate.userId ?? uuid,
			timestamp: candidate.timestamp === null ? undefined : new Date(candidate.timestamp).toISOString(),
			properties: {
				// First, so the run's own properties win over a context field of the same name
				...candidate.fields,
				...base,
				...exceptionProperties(candidate),
				...(candidate.userId === undefined ? { $process_person_profile: false as const } : {}),
				...(candidate.logMessage === undefined ? {} : { log_message: candidate.logMessage }),
			},
		};
	});
}

function errorLogToCandidates(log: TraceLog): Candidate[] {
	if (log.level !== 'error') {
		return [];
	}

	// message is the array of console.error arguments; the runtime's any goes no further
	const args: unknown[] = Array.isArray(log.message) ? log.message : [log.message];
	const { error, text, userId, fields } = readErrorLogArgs(args, log.errorInfo ?? []);
	return [
		{
			error: error ?? { name: 'LoggedError', message: text === '' ? 'Empty error log' : text },
			handled: true,
			timestamp: log.timestamp,
			userId,
			logMessage: error !== undefined && text !== '' ? text : undefined,
			fields,
		},
	];
}

type ErrorLogArgs = { error?: ErrorShape; text: string; userId?: string; fields: Record<string, string | number | boolean> };

// The first Error argument, the text of the string ones, and the User and fields of the context objects
function readErrorLogArgs(args: unknown[], errorInfo: (TraceLogErrorInfo | null)[]): ErrorLogArgs {
	const textParts: string[] = [];
	const fields: Record<string, string | number | boolean> = {};
	let error: ErrorShape | undefined;
	let userId: string | undefined;

	for (const [index, arg] of args.entries()) {
		const info = errorInfo[index];
		if (info) {
			error ??= info;
			continue;
		}
		if (typeof arg === 'string') {
			textParts.push(arg);
		} else if (isPlainObject(arg)) {
			userId ??= parseUserId(arg.userId);
			collectFields(arg, fields);
		}
	}
	return { error, text: cleanText(textParts.join(' ').trim()), userId, fields };
}

function failedOutcomeCandidates(item: TraceItem): Candidate[] {
	if (item.exceptions.length > 0 || item.outcome === 'ok' || isExpectedCancellation(item)) {
		return [];
	}
	return [
		{
			error: { name: item.outcome, message: `Invocation ended with outcome ${item.outcome}` },
			handled: false,
			synthetic: true,
			timestamp: item.eventTimestamp,
		},
	];
}

function isExpectedCancellation(item: TraceItem): boolean {
	if (item.outcome !== 'canceled') {
		return false;
	}
	const trigger = describeTrigger(item.event);
	return EXPECTED_CANCELLATIONS.some(
		(expected) => expected.worker === item.scriptName && expected.entrypoint === item.entrypoint && expected.trigger === trigger,
	);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Telegram from.id: an integer, or its digits as a string
function parseUserId(value: unknown): string | undefined {
	if (typeof value === 'number' && Number.isInteger(value)) {
		return String(value);
	}
	if (typeof value === 'string' && /^-?\d+$/u.test(value)) {
		return value;
	}
	return undefined;
}

// Primitive context fields, such as reason or episodeId, become event properties
function collectFields(context: Record<string, unknown>, fields: Record<string, string | number | boolean>): void {
	for (const [key, value] of Object.entries(context)) {
		if (key === 'userId' || key in fields || Object.keys(fields).length >= MAX_CONTEXT_FIELDS) {
			continue;
		}
		if (typeof value === 'string') {
			fields[key] = cleanText(scrubContextValue(key, value));
		} else if (typeof value === 'number' || typeof value === 'boolean') {
			fields[key] = value;
		}
	}
}

function sanitizeError(error: ErrorShape): ErrorShape {
	return {
		name: cleanText(error.name),
		message: cleanText(error.message),
		...(error.stack === undefined ? {} : { stack: scrubString(error.stack) }),
	};
}

function exceptionProperties(candidate: Candidate): Pick<ExceptionEventProperties, '$exception_level' | '$exception_list'> {
	const reconstructed = new Error(candidate.error.message);
	reconstructed.name = candidate.error.name;
	// An empty string, not undefined: otherwise the Error gets this worker's own
	// stack, and PostHog shows it instead of the stack of the worker that failed
	reconstructed.stack = candidate.error.stack ?? '';

	const { $exception_list, $exception_level } = errorPropertiesBuilder.buildFromUnknown(reconstructed, {
		mechanism: { handled: candidate.handled, synthetic: candidate.synthetic ?? false, type: 'generic' },
	});

	// The parser counts frames without an absolute path as library frames, and
	// in Workers every frame is like that (index.js:1:2). Our code is everything
	// outside node_modules. The frames are new objects, so they are changed in place
	for (const frame of $exception_list.flatMap((exception) => exception.stacktrace?.frames ?? [])) {
		frame.in_app = !(frame.filename ?? '').includes('node_modules');
	}
	return { $exception_level, $exception_list };
}

function baseProperties(
	item: TraceItem,
): Omit<ExceptionEventProperties, '$exception_level' | '$exception_list' | '$process_person_profile' | 'log_message'> {
	return {
		$lib: 'roadtrip-error-tracking' as const,
		environment: 'production' as const,
		worker: item.scriptName ?? 'unknown',
		entrypoint: item.entrypoint,
		execution_model: item.executionModel,
		outcome: item.outcome,
		release: item.scriptVersion?.id,
		trigger: describeTrigger(item.event),
	};
}

function describeTrigger(event: TraceItem['event']): string | undefined {
	if (event === null) {
		return undefined;
	}
	if ('request' in event) {
		return `${event.request.method} ${pathOf(event.request.url)}`;
	}
	if ('cron' in event) {
		return `cron ${event.cron}`;
	}
	if ('queue' in event) {
		return `queue ${event.queue}`;
	}
	if ('rpcMethod' in event) {
		return `rpc ${event.rpcMethod}`;
	}
	if ('scheduledTime' in event) {
		return 'alarm';
	}
	if ('getWebSocketEvent' in event) {
		return `websocket ${event.getWebSocketEvent.webSocketEventType}`;
	}
	if ('mailFrom' in event) {
		return 'email';
	}
	if ('consumedEvents' in event) {
		return 'tail';
	}
	return undefined;
}

// Only the path: the query string and the host are not sent, a bot token in
// the path (/bot<token>/…) is removed
function pathOf(url: string): string {
	try {
		return cleanText(new URL(url).pathname);
	} catch {
		return '<invalid url>';
	}
}

// Secrets go before the cut: cutting must not leave half a token
function cleanText(value: string): string {
	const clean = scrubString(value);
	return clean.length > MAX_TEXT_LENGTH ? `${clean.slice(0, MAX_TEXT_LENGTH)}…` : clean;
}
