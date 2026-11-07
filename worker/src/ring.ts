// GET /api/ring (spec «API кольца», «Кэш колец»): the ring from the ring cache in KV, or calculated by the engine
// in the Container. Side effects come through `deps`, built at the entry (index.ts).
import type { LogContext, Logger } from 'error-tracking/logger';
import { type Calculation, type CalculationFailure, CALCULATION_PATH, type CalculationRequest, type RingOutcome } from 'engine/protocol';
import type { RingError, RingResponse } from './api.ts';
import { closedCountries } from './closed-countries.ts';
import { parseRingQuery } from './query.ts';
import { MAX_CACHED_BYTES, RING_TTL_SECONDS, ringKey, roundOrigin, workerDataVersion } from './ring-cache.ts';

/** The ring cache: Workers KV. */
export interface RingCache {
	get(key: string): Promise<string | null>;
	put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

/** The Container with the engine server (engine/server): its answer to the request as it gave it. */
export interface Container {
	fetch(request: Request): Promise<Response>;
}

export interface RingDeps {
	readonly rings: RingCache;
	readonly container: Container;
	/** The version of the dataset the Worker was deployed with (engine/dataset/dataset.json). */
	readonly datasetVersion: string;
	readonly waitUntil: (promise: Promise<unknown>) => void;
	readonly logger: Pick<Logger, 'error' | 'info'>;
}

/** The steps of «Порядок работы Worker'а» (spec «API кольца»), with the visa rules still to come (#30). */
export async function handleRing(request: Request, deps: RingDeps): Promise<Response> {
	if (request.method !== 'GET') {
		return new Response(null, { status: 405, headers: { allow: 'GET' } });
	}
	// Step 1: the input.
	const query = parseRingQuery(new URL(request.url).searchParams);
	if ('problem' in query) {
		return json(400, { error: query.problem } satisfies RingError);
	}
	// What logger.error gets with an error. Never the origin: it must not reach PostHog.
	const context = { ...browserIds(request), hours: query.hours };
	// Steps 2–3, the visa rules and their reduction: for now only the closed countries, the same for everyone. The
	// visa rules (#30) replace them here, and may end the request with `visa_rules_missing`.
	const closed = closedCountries();
	// Steps 4–5: the key, from the fields the calculation gets and the data version.
	const calculation: CalculationRequest = { origin: roundOrigin(query.origin), hours: query.hours, closedCountries: closed };
	const version = await workerDataVersion(deps.datasetVersion);
	const key = await ringKey(version, calculation.origin, calculation.hours, calculation.closedCountries);
	const cached = await deps.rings.get(key);
	if (cached !== null) {
		return json(200, { ...(JSON.parse(cached) as RingOutcome), source: 'cache' } satisfies RingResponse);
	}

	// Step 6: the Container.
	let calculated: Calculation;
	try {
		calculated = await calculate(calculation, deps.container);
	} catch (error) {
		deps.logger.error('[ring] the Container failed', error, context);
		return json(502, { error: 'The engine failed' } satisfies RingError);
	}
	// Step 7: cache and answer. The visa rules (#30) apply the start country to `access` here.
	const { dataVersion: calculatedWith, joined, timings: _timings, ...outcome } = calculated;
	// A joined request got the result of another request's calculation, which caches it: a second write of the key
	// at the same moment would only meet KV's limit of one write a second per key.
	if (!joined) {
		cache(key, outcome, { version, calculatedWith }, context, deps);
	}
	return json(200, { ...outcome, source: joined ? 'joined' : 'calculation' } satisfies RingResponse);
}

/** A failure of the Container other than the engine's own error: it could not start, or answered something else. */
export class ContainerError extends Error {
	override name = 'ContainerError';
}

/** The Container's calculation; throws its failure as an Error with the engine's name, message and stack. */
async function calculate(calculation: CalculationRequest, container: Container): Promise<Calculation> {
	const response = await container.fetch(
		new Request(`http://engine${CALCULATION_PATH}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(calculation),
		}),
	);
	const text = await response.text();
	if (response.status === 200) {
		return JSON.parse(text) as Calculation;
	}
	throw engineError(response.status, text) ?? new ContainerError(`The Container answered ${response.status}: ${text.slice(0, 1000)}`);
}

/**
 * The engine's error from the engine server's 500 `{ name, message, stack }`, rebuilt into an Error: the Tail
 * Worker reads an Error's name, message and stack, not a plain object's (error-tracking/README.md).
 */
function engineError(status: number, text: string): Error | undefined {
	if (status !== 500) {
		return undefined;
	}
	let failure: Partial<Record<keyof CalculationFailure, unknown>>;
	try {
		failure = JSON.parse(text) as typeof failure;
	} catch {
		return undefined;
	}
	const { name, message, stack } = failure;
	return typeof name === 'string' && typeof message === 'string' && typeof stack === 'string'
		? Object.assign(new Error(message), { name, stack })
		: undefined;
}

/** The browser's PostHog ids from the headers `posthog-js` adds, for the context of `logger.error`. */
function browserIds(request: Request): { distinct_id?: string; session_id?: string } {
	const distinctId = request.headers.get('X-POSTHOG-DISTINCT-ID');
	const sessionId = request.headers.get('X-POSTHOG-SESSION-ID');
	return { ...(distinctId === null ? {} : { distinct_id: distinctId }), ...(sessionId === null ? {} : { session_id: sessionId }) };
}

/**
 * Writes the ring in the background, unless the Container calculated it with another data version than the
 * Worker's, as in a rollout (an old engine must not put its ring under a new key), or it is too big for KV.
 */
function cache(
	key: string,
	outcome: RingOutcome,
	versions: { version: string; calculatedWith: string },
	context: LogContext,
	deps: RingDeps,
): void {
	if (versions.calculatedWith !== versions.version) {
		deps.logger.info('[ring] the Container calculated with another data version: the ring is not cached', {
			worker: versions.version,
			container: versions.calculatedWith,
		});
		return;
	}
	const value = JSON.stringify(outcome);
	const bytes = new TextEncoder().encode(value).byteLength;
	if (bytes > MAX_CACHED_BYTES) {
		deps.logger.info('[ring] the ring is over 25 MiB: not cached', { bytes });
		return;
	}
	deps.waitUntil(
		deps.rings.put(key, value, { expirationTtl: RING_TTL_SECONDS }).catch((error: unknown) => {
			deps.logger.error('[ring] the ring cache did not take the ring', error, context);
		}),
	);
}

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
