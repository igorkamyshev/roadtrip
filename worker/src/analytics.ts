// The Worker's events in PostHog (spec #20 «Аналитика и ошибки», «Worker»; decision #18): what the system did, beside
// what the browser saw. `ring served` for each ring request that reached the Worker, `sherpa fetched` for each
// request to Sherpa. The Worker never sends the origin, not even rounded: its events are tied to the browser's session.
import type { RingOutcome } from 'engine/protocol';
import { PostHog, type PostHogOptions } from 'posthog-node';
import { PRODUCTION_HOST, type RingSource } from './api.ts';

/** Each ring request that reached the Worker. */
export interface RingServed {
	/**
	 * Absent for `visa_rules_missing`, which asked neither the cache nor the Container, and for a query that is no ring
	 * query (400) or a method other than GET (405).
	 */
	readonly source?: RingSource;
	/** The engine's outcome, `visa_rules_missing`, or `error`: the Container failed (502), or a 400 or 405. */
	readonly outcome: RingOutcome['outcome'] | 'visa_rules_missing' | 'error';
	/**
	 * The ring's upper bound in hours: N of an hour, 24 for day 2 (#82), which names the slider's cell alone; absent
	 * for a 400 or 405.
	 */
	readonly hours?: number;
	/** From the request to the answer. */
	readonly duration_ms: number;
	/** The Container's timings of a calculation (and of the calculation a joined request waited for). */
	readonly queue_ms?: number;
	readonly traversal_ms?: number;
	readonly contour_ms?: number;
	/** Waiting for the Container to start, when the request did. */
	readonly cold_start_ms?: number;
}

/** Each request to Sherpa's `/v3/maps`. */
export interface SherpaFetched {
	readonly citizenship: string;
	readonly result: 'ok' | 'http_error' | 'timeout' | 'bad_response';
	/** Sherpa's HTTP status; absent without an answer (no connection, a timeout). */
	readonly status?: number;
	readonly duration_ms: number;
	/** `background` refreshed a stale copy the person was served; `blocking` was waited for, as there was no copy. */
	readonly mode: 'background' | 'blocking';
	/** What is left of the quota, when Sherpa says it in a header. */
	readonly quota_remaining?: number;
}

export interface WorkerEvents {
	'ring served': RingServed;
	'sherpa fetched': SherpaFetched;
}

export type WorkerEvent = keyof WorkerEvents;

/** The Worker's events of one request, tied to the browser that sent it. */
export interface Analytics {
	readonly capture: <Event extends WorkerEvent>(event: Event, properties: WorkerEvents[Event]) => void;
}

/** Straight to PostHog's US cloud: the managed proxy is for browsers. */
const POSTHOG_HOST = 'https://us.i.posthog.com';

/** Every event without the browser's distinct id has this one, a constant (decision #18). */
const SERVER_DISTINCT_ID = 'server';

/** How long an id the browser sent may be, as the Tail Worker cuts them (error-tracking). */
const MAX_ID_LENGTH = 1000;

export type PostHogFetch = NonNullable<PostHogOptions['fetch']>;

export interface RequestAnalyticsOptions {
	/** The project token (`phc_`), the var `POSTHOG_API_KEY`: it only writes events, so it is public. */
	readonly token: string;
	/** The request's `ctx.waitUntil`: each send outlives the answer. */
	readonly waitUntil: (promise: Promise<unknown>) => void;
	/** The network under posthog-node; tests pass PostHog's double. */
	readonly fetch?: PostHogFetch;
}

/**
 * The analytics of one request (spec #20 «Worker»): a client of its own that sends each event at once (`flushAt: 1`,
 * `flushInterval: 0`, `captureImmediate` in `waitUntil`), as the browser's `X-POSTHOG-DISTINCT-ID` (else `server`)
 * with its `X-POSTHOG-SESSION-ID`, and creates no person. Disabled off the production host. `shutdown` ends the
 * client once the answer is out; a background send after it, as a refresh from Sherpa's, still goes.
 */
export function requestAnalytics(
	request: Request,
	{ token, waitUntil, fetch }: RequestAnalyticsOptions,
): Analytics & { readonly shutdown: () => void } {
	const posthog = new PostHog(token, {
		host: POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
		disabled: new URL(request.url).hostname !== PRODUCTION_HOST,
		...(fetch === undefined ? {} : { fetch }),
	});
	const { distinct_id: distinctId, session_id: sessionId } = browserIds(request);
	const browser = {
		distinctId: distinctId === undefined ? SERVER_DISTINCT_ID : cleanId(distinctId),
		session: sessionId === undefined ? {} : { $session_id: cleanId(sessionId) },
	};
	return {
		capture(event, properties) {
			waitUntil(
				posthog.captureImmediate({
					distinctId: browser.distinctId,
					event,
					properties: { ...properties, ...browser.session, $process_person_profile: false },
				}),
			);
		},
		shutdown() {
			waitUntil(posthog.shutdown());
		},
	};
}

/**
 * The browser's PostHog ids from the headers `posthog-js` adds to its requests to the production host (`tracing_headers`),
 * as they came: for `logger.error`'s context, which the Tail Worker cleans, and for the events here.
 */
export function browserIds(request: Request): { distinct_id?: string; session_id?: string } {
	const distinctId = request.headers.get('X-POSTHOG-DISTINCT-ID');
	const sessionId = request.headers.get('X-POSTHOG-SESSION-ID');
	return { ...(distinctId === null ? {} : { distinct_id: distinctId }), ...(sessionId === null ? {} : { session_id: sessionId }) };
}

/** An id from a header without control characters, cut to 1000 characters. */
function cleanId(id: string): string {
	// oxlint-disable-next-line no-control-regex -- the control characters are what this removes, as the Tail Worker does
	return id.replaceAll(/[\u0000-\u001F\u007F]/gu, '').slice(0, MAX_ID_LENGTH);
}
