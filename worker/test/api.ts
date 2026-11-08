// The ring API's seam (spec «Решения по тестам», seam 2): the handler of GET /api/ring with its dependencies through
// `deps`. The Container is the engine server with the real engine in this process, on a graph the builder makes of an
// OSM fixture (data/test/fixtures, values worked out in each header), or a double. Sherpa is a faked `fetch`
// (sherpa-double.ts). Both KV namespaces are doubles in memory (memory-kv.ts) whose entries expire by one clock the
// test moves, the clock the handler reads too (timers.ts).
import { computeRing, dataVersion } from 'engine';
import type { Graph } from 'engine/graph';
import { createEngineServer } from 'engine/server';
import { borderTable, VISA_EXEMPTIONS, type VisaExemption } from 'rules';
import type { Container } from '../src/container.ts';
import { field, isRecord } from 'engine/json';
import { handleRing, type RingDeps } from '../src/ring.ts';
import { type AnalyticsDouble, analyticsDouble } from './analytics-double.ts';
import { MemoryKv } from './memory-kv.ts';
import { SherpaDouble } from './sherpa-double.ts';
import { type Clock, type Timers, timersOn } from './timers.ts';

export const DATASET = '2026-11-01';
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** When every test starts: 2026-11-07 00:00 UTC. */
export const START = Date.UTC(2026, 10, 7);

/** The Container: the engine server in this process, calculating with the engine on `graph`. */
export async function engineContainer(graph: Graph, dataset = DATASET): Promise<Container> {
	const server = createEngineServer({
		calculate: (request) => Promise.resolve(computeRing(graph, borderTable, request)),
		dataVersion: await dataVersion(dataset, borderTable),
	});
	return { fetch: (request) => server.fetch(request) };
}

/**
 * A Container that answers every request with `status` and `body`; a 200's body is completed into a calculation of
 * the Worker's data version that did not wait.
 */
export async function answering(status: number, body: object, dataset = DATASET): Promise<Container> {
	const calculation = {
		dataVersion: await dataVersion(dataset, borderTable),
		joined: false,
		timings: { queueMs: 0, traversalMs: 1200, contourMs: 300 },
		...body,
	};
	return { fetch: () => Promise.resolve(Response.json(status === 200 ? calculation : body, { status })) };
}

/** `container`, keeping the body of each request it gets. */
export function recorded(container: Container): Container & { bodies: unknown[] } {
	const bodies: unknown[] = [];
	return {
		bodies,
		fetch: async (request) => {
			bodies.push(await request.clone().json());
			return container.fetch(request);
		},
	};
}

/** The closed countries of a request to the Container, from the body `recorded` kept. */
export function closedCountriesOf(body: unknown): string[] {
	const closed = field(body, 'closedCountries');
	if (!Array.isArray(closed)) {
		throw new TypeError(`No closed countries in ${JSON.stringify(body)}`);
	}
	return closed.filter((country: unknown) => typeof country === 'string');
}

/** `container`, whose every answer takes `ms` by `clock`. */
export function taking(ms: number, clock: Clock, container: Container): Container {
	return {
		fetch: async (request) => {
			clock.now += ms;
			return container.fetch(request);
		},
	};
}

/** `container`, counting the requests it gets. */
export function counted(container: Container): Container & { calls: number } {
	const result = {
		calls: 0,
		fetch: (request: Request) => {
			result.calls++;
			return container.fetch(request);
		},
	};
	return result;
}

export const SHERPA_API_KEY = 'sherpa-test-key';

/** An answer of the handler: its status and its body, a JSON object. */
interface Answer {
	readonly status: number;
	readonly body: Readonly<Record<string, unknown>>;
}

/** The handler with its deps and doubles, as `api` gives them. */
interface Api {
	/** GET /api/ring with `query`, once the handler's background work is done too. */
	readonly get: (query: string, headers?: Record<string, string>) => Promise<Answer>;
	/** GET /api/ring with `query`, as soon as it answers. */
	readonly request: (query: string, headers?: Record<string, string>) => Promise<Answer>;
	/** Waits for the handler's background work. */
	readonly settle: () => Promise<void>;
	readonly clock: Clock;
	readonly timers: Timers;
	readonly rings: MemoryKv;
	readonly visaRules: MemoryKv;
	readonly sherpa: SherpaDouble;
	/** The arguments of each `logger.error`. */
	readonly errors: unknown[][];
	readonly analytics: AnalyticsDouble;
	readonly deps: RingDeps;
}

/**
 * The handler with its deps: a ring cache, a visa rules' store, a Sherpa, a PostHog and timers of its own unless given
 * ones, all on `clock`, and the shipped visa exemptions' table unless given rows. `get` sends GET /api/ring with `query`
 * and waits for the handler's background work too; `request` does not, and `settle` waits for it later.
 */
export function api({
	container,
	datasetVersion = DATASET,
	clock = { now: START },
	rings = new MemoryKv(clock),
	visaRules = new MemoryKv(clock),
	sherpa = new SherpaDouble(),
	visaExemptions = VISA_EXEMPTIONS,
	analytics = analyticsDouble(),
	timers = timersOn(clock),
}: {
	container: Container;
	datasetVersion?: string;
	clock?: Clock;
	timers?: Timers;
	rings?: MemoryKv;
	visaRules?: MemoryKv;
	sherpa?: SherpaDouble;
	visaExemptions?: readonly VisaExemption[];
	analytics?: AnalyticsDouble;
}): Api {
	const errors: unknown[][] = [];
	const background: Promise<unknown>[] = [];
	const deps: RingDeps = {
		rings,
		visaRules,
		refreshing: new Set(),
		visaExemptions,
		container,
		datasetVersion,
		fetch: sherpa.fetch,
		sherpaApiKey: SHERPA_API_KEY,
		now: () => clock.now,
		sleep: timers.sleep,
		waitUntil: (promise) => {
			background.push(promise);
		},
		logger: {
			error: (...args) => {
				errors.push(args);
			},
			info: () => {},
		},
		analytics,
	};
	const request = async (query: string, headers: Record<string, string> = {}) => {
		const response = await handleRing(new Request(`https://roadtrip.kamyshev.me/api/ring?${query}`, { headers }), deps);
		const body: unknown = await response.json();
		if (!isRecord(body)) {
			throw new TypeError(`The handler answered ${JSON.stringify(body)}, not an object`);
		}
		return { status: response.status, body };
	};
	const settle = async () => {
		while (background.length > 0) {
			await Promise.all(background.splice(0));
		}
	};
	const get = async (query: string, headers: Record<string, string> = {}) => {
		const answer = await request(query, headers);
		await settle();
		return answer;
	};
	return { get, request, settle, clock, timers, rings, visaRules, sherpa, errors, analytics, deps };
}
