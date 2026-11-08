// GET /api/ring (spec «API кольца», «Кэш колец»): the ring from the ring cache in KV, or calculated by the engine
// in the Container. Side effects come through `deps`, built at the entry (index.ts).
import type { Logger } from 'error-tracking/logger';
import { utcDate, type VisaExemption } from 'rules';
import { reduceVisaRules, withStartCountry } from './access.ts';
import { type Analytics, browserIds, type RingServed } from './analytics.ts';
import type { RingError, RingQuery, RingResponse } from './api.ts';
import { calculate, type Container } from './container.ts';
import type { Kv } from './kv.ts';
import { parseRingQuery } from './query.ts';
import { cachedRing, cacheRing, ringKey, roundOrigin, workerDataVersion } from './ring-cache.ts';
import { citizenshipsRules } from './visa-rules.ts';

export interface RingDeps {
	/** The ring cache. */
	readonly rings: Kv;
	/** Sherpa's copies, by citizenship (visa-rules.ts). */
	readonly visaRules: Kv;
	/** The citizenships whose stale copy this isolate is refreshing (visa-rules.ts). */
	readonly refreshing: Set<string>;
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
	/** Resolves after `ms`, for Sherpa's timeout: `setTimeout`, or the tests' timers. */
	readonly sleep: (ms: number) => Promise<void>;
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
	const visaRulesLoadedAt = [...rules.copies.values()].map((copy) => copy.loadedAt).toSorted()[0];
	// What the answer adds to the engine's outcome, the start country open in `access` (step 7).
	const visa = (startCountry: string | null) => ({ access: withStartCountry(access, startCountry), visaRulesLoadedAt });

	// Steps 4–5: the key, from the fields the calculation gets and the data version.
	const calculation = { origin: roundOrigin(query.origin), hours: query.hours, closedCountries: closed };
	const version = await workerDataVersion(deps.datasetVersion);
	const key = await ringKey(version, calculation);
	const cached = await cachedRing(deps.rings, key);
	if (cached !== undefined) {
		return {
			status: 200,
			body: { ...cached, ...visa(cached.startCountry), source: 'cache' },
			served: { source: 'cache', outcome: cached.outcome },
		};
	}

	// Step 6: the Container.
	const calculated = await calculate(calculation, deps.container).catch((error: unknown): undefined => {
		deps.logger.error('[ring] the Container failed', error, context);
		return undefined;
	});
	if (calculated === undefined) {
		return { status: 502, body: { error: 'The engine failed' }, served: { source: 'calculation', outcome: 'error' } };
	}
	// Step 7: cache and answer, the start country open in `access`.
	const { dataVersion: calculatedWith, joined, timings, ...outcome } = calculated;
	// A joined request got the result of another request's calculation, which caches it: a second write of the key
	// at the same moment would only meet KV's limit of one write a second per key.
	if (!joined) {
		cacheRing({ key, outcome, version, calculatedWith, context }, deps);
	}
	const source = joined ? 'joined' : 'calculation';
	return {
		status: 200,
		body: { ...outcome, ...visa(outcome.startCountry), source },
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

function json(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
