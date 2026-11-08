// GET /api/ring (spec «API кольца», «Кэш колец»): the ring from the ring cache in KV, or calculated by the engine
// in the Container. Side effects come through `deps`, built at the entry (index.ts).
import type { LogContext, Logger } from 'error-tracking/logger';
import { utcDate, type VisaExemption } from 'rules';
import { type Calculation, type CalculationFailure, CALCULATION_PATH, type CalculationRequest, type RingOutcome } from 'engine/protocol';
import { reduceVisaRules, withStartCountry } from './access.ts';
import { type Analytics, browserIds, type RingServed } from './analytics.ts';
import type { RingError, RingQuery, RingResponse } from './api.ts';
import { parseRingQuery } from './query.ts';
import { MAX_CACHED_BYTES, RING_TTL_SECONDS, ringKey, roundOrigin, workerDataVersion } from './ring-cache.ts';
import { citizenshipsRules, type VisaRulesStore } from './visa-rules.ts';

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
	/** Sherpa's copies, by citizenship (visa-rules.ts). */
	readonly visaRules: VisaRulesStore;
	/** The visa exemptions' table: rules' `VISA_EXEMPTIONS`, which deploys with the Worker. */
	readonly visaExemptions: readonly VisaExemption[];
	readonly container: Container;
	/** The version of the dataset the Worker was deployed with (engine/dataset/dataset.json). */
	readonly datasetVersion: string;
	/** For Sherpa: the global fetch. */
	readonly fetch: (request: Request) => Promise<Response>;
	/** The secret `SHERPA_API_KEY`. */
	readonly sherpaApiKey: string;
	/** Milliseconds since the epoch. */
	readonly now: () => number;
	readonly waitUntil: (promise: Promise<unknown>) => void;
	readonly logger: Pick<Logger, 'error' | 'info'>;
	/** PostHog: `ring served` and `sherpa fetched`, tied to the browser that sent the request (analytics.ts). */
	readonly analytics: Analytics;
}

/** The steps of «Порядок работы Worker'а» (spec «API кольца»), and `ring served` for each request. */
export async function handleRing(request: Request, deps: RingDeps): Promise<Response> {
	const started = deps.now();
	// A request that is no ring request is an error with neither a source nor N.
	const refused = (response: Response) => {
		deps.analytics.capture('ring served', { outcome: 'error', duration_ms: deps.now() - started });
		return response;
	};
	if (request.method !== 'GET') {
		return refused(new Response(null, { status: 405, headers: { allow: 'GET' } }));
	}
	// Step 1: the input.
	const query = parseRingQuery(new URL(request.url).searchParams);
	if ('problem' in query) {
		return refused(json(400, { error: query.problem } satisfies RingError));
	}
	const { status, body, served } = await serve(query, browserIds(request), deps);
	deps.analytics.capture('ring served', { ...served, hours: query.hours, duration_ms: deps.now() - started });
	return json(status, body);
}

/** What `ring served` says of an answer besides N and the duration. */
type Served = Omit<RingServed, 'hours' | 'duration_ms'>;

/** Steps 2–7 for a valid query: the answer, and what `ring served` says of it. */
async function serve(
	query: RingQuery,
	browser: ReturnType<typeof browserIds>,
	deps: RingDeps,
): Promise<{ status: number; body: RingResponse | RingError; served: Served }> {
	// What logger.error gets with an error. Never the origin: it must not reach PostHog.
	const context = { ...browser, hours: query.hours };
	// Step 2: the citizenships' visa rules, or `visa_rules_missing` for the first without any.
	const rules = await citizenshipsRules(query.citizenships, deps, context);
	if ('missing' in rules) {
		return {
			status: 200,
			body: { outcome: 'visa_rules_missing', missingCitizenship: rules.missing },
			served: { outcome: 'visa_rules_missing' },
		};
	}
	// Step 3: their reduction with the held visas and the exemptions' rows acting today, into the entry modes and the
	// closed countries.
	const { access, closed } = reduceVisaRules({
		citizenships: query.citizenships,
		sherpa: new Map([...rules.copies].map(([citizenship, copy]) => [citizenship, copy.classes])),
		heldVisas: query.visas,
		exemptions: deps.visaExemptions,
		today: utcDate(deps.now()),
	});
	const visaRulesLoadedAt = [...rules.copies.values()].map((copy) => copy.loadedAt).sort()[0];
	// What the answer adds to the engine's outcome, the start country open in `access` (step 7).
	const visa = (outcome: RingOutcome) => ({ access: withStartCountry(access, outcome.startCountry), visaRulesLoadedAt });

	// Steps 4–5: the key, from the fields the calculation gets and the data version.
	const calculation: CalculationRequest = { origin: roundOrigin(query.origin), hours: query.hours, closedCountries: closed };
	const version = await workerDataVersion(deps.datasetVersion);
	const key = await ringKey(version, calculation.origin, calculation.hours, calculation.closedCountries);
	const cached = await deps.rings.get(key);
	if (cached !== null) {
		const outcome = JSON.parse(cached) as RingOutcome;
		return { status: 200, body: { ...outcome, ...visa(outcome), source: 'cache' }, served: { source: 'cache', outcome: outcome.outcome } };
	}

	// Step 6: the Container.
	let calculated: Calculation;
	try {
		calculated = await calculate(calculation, deps.container);
	} catch (error) {
		deps.logger.error('[ring] the Container failed', error, context);
		return { status: 502, body: { error: 'The engine failed' }, served: { source: 'calculation', outcome: 'error' } };
	}
	// Step 7: cache and answer, the start country open in `access`.
	const { dataVersion: calculatedWith, joined, timings, ...outcome } = calculated;
	// A joined request got the result of another request's calculation, which caches it: a second write of the key
	// at the same moment would only meet KV's limit of one write a second per key.
	if (!joined) {
		cache(key, outcome, { version, calculatedWith }, context, deps);
	}
	const source = joined ? 'joined' : 'calculation';
	return {
		status: 200,
		body: { ...outcome, ...visa(outcome), source },
		// The engine measures in fractions of a millisecond.
		served: {
			source,
			outcome: outcome.outcome,
			queue_ms: Math.round(timings.queueMs),
			traversal_ms: Math.round(timings.traversalMs),
			contour_ms: Math.round(timings.contourMs),
			...(timings.coldStartMs === undefined ? {} : { cold_start_ms: Math.round(timings.coldStartMs) }),
		},
	};
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
