import { ErrorTracking } from '@posthog/core';
import { v5 as uuidV5 } from 'uuid';

import { scrubContextValue, scrubString } from './scrub';

// What in a TraceItem counts as an error (after numon's apps/error-tracking):
// 1. Each exceptions[] entry is an unhandled exception (handled: false).
// 2. Each error log is a handled error (handled: true): type, message and stack
//    from errorInfo; without an Error argument, a LoggedError with the log text.
// 3. A run whose outcome is not ok, with empty exceptions[], is a synthetic
//    exception typed as the outcome, except a cut-off run of those that end so
//    on a normal run too (EXPECTED_CANCELLATIONS).
// 4. The same (type, message) within one run is one event: "log and rethrow"
//    is not doubled, and the browser's ids, log text and context move to the
//    event kept.
//
// The distinct_id and session_id of the logger.error context, which the Worker
// copies from the browser's X-POSTHOG-* headers, become the event's distinct_id
// and $session_id. Without a distinct_id the event gets a one-off one. No event
// creates a person: the browser's person is anonymous, and every Worker event is
// personless (spec #20 «Аналитика и ошибки»).

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
	$process_person_profile: false;
	$session_id?: string;
	log_message?: string;
}>;

/** Primitive fields of the logger.error context other than distinct_id and session_id. */
type LogFields = Readonly<Record<string, unknown>>;

type ErrorShape = Readonly<{ name: string; message: string; stack?: string }>;

type Candidate = Readonly<{
	error: ErrorShape;
	handled: boolean;
	synthetic?: boolean;
	timestamp: number | null;
	distinctId?: string;
	sessionId?: string;
	logMessage?: string;
	fields?: LogFields;
}>;

const MAX_TEXT_LENGTH = 2_000;
const MAX_CONTEXT_FIELDS = 20;
// As PostHog's example of reading X-POSTHOG-* headers on a server cuts them
const MAX_ID_LENGTH = 1_000;
/** Context keys that tie the error to the browser instead of becoming fields. */
const BROWSER_KEYS = new Set(['distinct_id', 'session_id']);

/**
 * A worker's entrypoint and trigger, as the event's `worker`, `entrypoint` and `trigger` name them, and the outcomes
 * its normal run ends with when cut off.
 */
type ExpectedCancellation = Readonly<{ worker: string; entrypoint: string; trigger: RegExp; outcomes: readonly string[] }>;

// The entrypoint of a worker's main handler. The runtime leaves a TraceItem's
// entrypoint empty for its runs (a tile's and a ring request's in prod, #151),
// so an empty one is matched as this.
const DEFAULT_ENTRYPOINT = 'default';

// Runs whose cut-off outcomes, `canceled` for most, are no error: they end so
// on a normal run, and a failure in them reaches PostHog as its own exception or
// error log. Any other run cut off midway is still a synthetic exception.
// Reviewed for roadtrip (#26) from ytc's list, which held its container's alarm
// and a Workflow (roadtrip has no Workflows); the routes' entries were then
// checked against PostHog's events from prod (#151). The Durable Object migration pins the class name, and
// the routes are the spec's: a rename in the worker package changes this list too.
const EXPECTED_CANCELLATIONS: readonly ExpectedCancellation[] = [
	// @cloudflare/containers keeps the container's Durable Object awake with a
	// loop of alarms. When the container stops (sleepAfter ran out, or a new
	// image replaces it), the alarm then waiting ends canceled: ytc saw it end
	// so (about 100 ms, no CPU) on every stop. A container that crashes is
	// reported by onStop or onError, and a failed ring by the Worker that asked.
	{ worker: 'roadtrip', entrypoint: 'EngineContainer', trigger: /^alarm$/u, outcomes: ['canceled'] },
	// The person left the page before the ring came: the browser reports it as
	// `abandoned`. A calculation can wait minutes in the Container's queue, so
	// this is common and nothing to fix. What failed in such a run is logged.
	// The Worker's call into EngineContainer, POST /ring, ends canceled with it
	// a moment later (seen in prod, #151), and stays a synthetic exception: the
	// Owner keeps it out of this list.
	{ worker: 'roadtrip', entrypoint: DEFAULT_ENTRYPOINT, trigger: /^GET \/api\/ring$/u, outcomes: ['canceled'] },
	// MapLibre aborts the tile requests it no longer needs whenever the map
	// moves, so the Worker's read from R2 is cut off: `canceled`, or
	// `responseStreamDisconnected` when its body was already on the way.
	{
		worker: 'roadtrip',
		entrypoint: DEFAULT_ENTRYPOINT,
		trigger: /^GET \/tiles\//u,
		outcomes: ['canceled', 'responseStreamDisconnected'],
	},
];

// The runtime's line when it cancels waitUntil work that outlived the run's 30 s
// (the background Sherpa refresh, the PostHog sends). Such a run is never an
// expected cancellation: something hung (Workers docs, «Context»).
const WAIT_UNTIL_CUT_OFF = 'waitUntil() tasks did not complete';

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
	// exceptions come before logs); the browser's ids, log text and context from
	// the first that has them
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
						distinctId: existing.distinctId ?? candidate.distinctId,
						sessionId: existing.sessionId ?? candidate.sessionId,
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
			distinct_id: candidate.distinctId ?? uuid,
			timestamp: candidate.timestamp === null ? undefined : new Date(candidate.timestamp).toISOString(),
			properties: {
				// First, so the run's own properties win over a context field of the same name
				...candidate.fields,
				...base,
				...exceptionProperties(candidate),
				$process_person_profile: false,
				...(candidate.sessionId === undefined ? {} : { $session_id: candidate.sessionId }),
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
	const { error, text, distinctId, sessionId, fields } = readErrorLogArgs(args, log.errorInfo ?? []);
	return [
		{
			error: error ?? { name: 'LoggedError', message: text === '' ? 'Empty error log' : text },
			handled: true,
			timestamp: log.timestamp,
			distinctId,
			sessionId,
			logMessage: error !== undefined && text !== '' ? text : undefined,
			fields,
		},
	];
}

type ErrorLogArgs = {
	error?: ErrorShape;
	text: string;
	distinctId?: string;
	sessionId?: string;
	fields: Record<string, string | number | boolean>;
};

// The first Error argument, the text of the string ones, and the browser's ids and fields of the context objects
function readErrorLogArgs(args: unknown[], errorInfo: (TraceLogErrorInfo | null)[]): ErrorLogArgs {
	const textParts: string[] = [];
	const fields: Record<string, string | number | boolean> = {};
	let error: ErrorShape | undefined;
	let distinctId: string | undefined;
	let sessionId: string | undefined;

	for (const [index, arg] of args.entries()) {
		const info = errorInfo[index];
		if (info) {
			error ??= info;
			continue;
		}
		if (typeof arg === 'string') {
			textParts.push(arg);
		} else if (isPlainObject(arg)) {
			distinctId ??= parseBrowserId(arg.distinct_id);
			sessionId ??= parseBrowserId(arg.session_id);
			collectFields(arg, fields);
		}
	}
	return { error, text: cleanText(textParts.join(' ').trim()), distinctId, sessionId, fields };
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
	if (item.logs.some((log) => logText(log).includes(WAIT_UNTIL_CUT_OFF))) {
		return false;
	}
	const trigger = describeTrigger(item.event) ?? '';
	const entrypoint = item.entrypoint ?? DEFAULT_ENTRYPOINT;
	return EXPECTED_CANCELLATIONS.some(
		(expected) =>
			expected.outcomes.includes(item.outcome) &&
			expected.worker === item.scriptName &&
			expected.entrypoint === entrypoint &&
			expected.trigger.test(trigger),
	);
}

// A log line's string arguments, whatever its level
function logText(log: TraceLog): string {
	const args: unknown[] = Array.isArray(log.message) ? log.message : [log.message];
	return args.filter((arg) => typeof arg === 'string').join(' ');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A posthog-js id from a browser header: a string, without control characters
// (as PostHog's example cleans these headers), cut to a sane length
function parseBrowserId(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}
	// oxlint-disable-next-line no-control-regex -- the control characters are what this removes from the header's id
	const id = value.replaceAll(/[\u0000-\u001F\u007F]/gu, '').slice(0, MAX_ID_LENGTH);
	return id === '' ? undefined : id;
}

// Primitive context fields, such as reason or citizenship, become event properties
function collectFields(context: Record<string, unknown>, fields: Record<string, string | number | boolean>): void {
	for (const [key, value] of Object.entries(context)) {
		if (BROWSER_KEYS.has(key) || key in fields || Object.keys(fields).length >= MAX_CONTEXT_FIELDS) {
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
): Omit<ExceptionEventProperties, '$exception_level' | '$exception_list' | '$process_person_profile' | '$session_id' | 'log_message'> {
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

// Only the path: the host and the query string, which holds the start point of
// a ring request, are not sent; a secret in the path is removed
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
