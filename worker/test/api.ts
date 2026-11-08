// The ring API's seam (spec «Решения по тестам», seam 2) and its doubles: the handler of GET /api/ring with its
// dependencies through `deps`. The Container is the engine server with the real engine in this process, on a graph
// the builder makes of an OSM fixture (data/test/fixtures, values worked out in each header), or a double. Sherpa
// is a faked `fetch`. Both KV namespaces are doubles in memory whose entries expire by one clock the test moves,
// the clock the handler reads too.
import { computeRing, dataVersion } from 'engine';
import type { Graph } from 'engine/graph';
import { createEngineServer } from 'engine/server';
import { borderTable, COUNTRIES, VISA_EXEMPTIONS, type VisaExemption } from 'rules';
import type { Analytics, WorkerEvent, WorkerEvents } from '../src/analytics.ts';
import { type Container, handleRing, type RingDeps } from '../src/ring.ts';

export const DATASET = '2026-11-01';
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** When every test starts: 2026-11-07 00:00 UTC. */
export const START = Date.UTC(2026, 10, 7);

export interface Clock {
	now: number;
}

/**
 * The handler's timers on `clock`: `sleep` (deps) ends once the test has moved the clock past it with `advance`, never
 * on its own, as `setTimeout` would.
 */
export class Timers {
	readonly #sleeping: { readonly until: number; readonly wake: () => void }[] = [];

	constructor(readonly clock: Clock) {}

	readonly sleep = (ms: number): Promise<void> =>
		new Promise((wake) => {
			this.#sleeping.push({ until: this.clock.now + ms, wake });
		});

	/** Lets the handler run up to its next wait, moves the clock by `ms`, ends the sleeps due by then, and lets it run on. */
	async advance(ms: number): Promise<void> {
		await settled();
		this.clock.now += ms;
		for (const sleeper of this.#sleeping.filter(({ until }) => until <= this.clock.now)) {
			this.#sleeping.splice(this.#sleeping.indexOf(sleeper), 1);
			sleeper.wake();
		}
		await settled();
	}
}

/** Once the promises that can go on have gone on: a few turns of Node's event loop. */
async function settled(): Promise<void> {
	for (let turn = 0; turn < 10; turn++) {
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
	}
}

/** The Container: the engine server in this process, calculating with the engine on `graph`. */
export async function engineContainer(graph: Graph, dataset = DATASET): Promise<Container> {
	const server = createEngineServer({
		calculate: async (request) => computeRing(graph, borderTable, request),
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
	return { fetch: async () => Response.json(status === 200 ? calculation : body, { status }) };
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

/** PostHog's double: the Worker's events of every request, in the order they were captured. */
export class AnalyticsDouble implements Analytics {
	readonly events: { readonly event: WorkerEvent; readonly properties: object }[] = [];

	capture<Event extends WorkerEvent>(event: Event, properties: WorkerEvents[Event]): void {
		this.events.push({ event, properties });
	}

	/** The properties of each `event` captured, in order. */
	named<Event extends WorkerEvent>(event: Event): WorkerEvents[Event][] {
		return this.events.filter((captured) => captured.event === event).map((captured) => captured.properties as WorkerEvents[Event]);
	}
}

/** Workers KV in memory: an entry put with `expirationTtl` is gone that many seconds later by `clock`. */
export class MemoryKv {
	readonly entries = new Map<string, { value: string; expiresAt: number }>();

	constructor(readonly clock: Clock) {}

	async get(key: string): Promise<string | null> {
		const entry = this.entries.get(key);
		return entry !== undefined && this.clock.now < entry.expiresAt ? entry.value : null;
	}

	async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
		const ttl = options?.expirationTtl;
		this.entries.set(key, { value, expiresAt: ttl === undefined ? Infinity : this.clock.now + ttl * 1000 });
	}
}

/** Sherpa's groups in `/v3/maps` (research/sherpa-api, §2.2). */
export type SherpaGroup =
	| 'NO_VISA_REQUIRED'
	| 'VISA_ON_ARRIVAL_REQUIRED'
	| 'EVISA_OR_ETA_REQUIRED'
	| 'PAPER_OR_EMBASSY_VISA_REQUIRED'
	| 'RESTRICTED_ENTRY'
	| 'UNKNOWN_ENTRY_RESTRICTION'
	| 'UNKNOWN_VISA_INFO';

/** Every country Sherpa may list: ISO 3166-1, RKS and NX. */
export const SHERPA_COUNTRIES = Object.keys(COUNTRIES);

/**
 * The body of Sherpa's answer to `/v3/maps` for `passport`, shaped as on 2026-11-07 (research/sherpa-api, §3.3):
 * every country in `groups` where it says, the rest of `SHERPA_COUNTRIES` in `rest`, but for the passport's own
 * country and `absent`, which Sherpa leaves out.
 */
export function sherpaMap(
	passport: string,
	{ groups = {}, rest = 'NO_VISA_REQUIRED', absent = [] }: { groups?: Readonly<Record<string, SherpaGroup>>; rest?: SherpaGroup; absent?: readonly string[] } = {},
): object {
	const series = new Map<SherpaGroup, { id: string; type: 'LOCATION'; name: string }[]>();
	for (const country of SHERPA_COUNTRIES) {
		if (country === passport || absent.includes(country)) {
			continue;
		}
		const group = groups[country] ?? rest;
		series.set(group, [...(series.get(group) ?? []), { id: country, type: 'LOCATION', name: country }]);
	}
	return {
		meta: { copyright: 'Sherpa', version: '3.0.3' },
		data: {
			type: 'MAP',
			id: '0563bbcc-247d-445b-9a75-fcb85291e417',
			attributes: {
				passportCode: passport,
				series: [...series].map(([type, data]) => ({ type, label: type, title: type, total: data.length, data })),
				locationDetails: {},
			},
		},
	};
}

/**
 * How the double answers a passport: 201 with a body (`sherpaMap`'s, or any JSON or text) and the headers given,
 * another status, a dropped connection, or nothing until the request is aborted.
 */
export type SherpaReply =
	| { readonly body: unknown; readonly headers?: Readonly<Record<string, string>> }
	| { readonly text: string }
	| { readonly status: number }
	| 'network error'
	| 'no answer';

/** Sherpa's `/v3/maps`: records each request, and answers it by `reply` once the test lets it. */
export class SherpaDouble {
	readonly requests: { readonly passport: string; readonly request: Request; readonly body: unknown }[] = [];
	#reply: (passport: string) => SherpaReply = (passport) => ({ body: sherpaMap(passport) });
	#held: Promise<void> | undefined;
	#release = () => {};

	/** How every next request is answered; by default every passport gets every country visa-free. */
	answer(reply: (passport: string) => SherpaReply): void {
		this.#reply = reply;
	}

	/** Holds every next answer until `release`. */
	hold(): void {
		this.#held = new Promise((resolve) => {
			this.#release = resolve;
		});
	}

	release(): void {
		this.#release();
		this.#held = undefined;
	}

	/** The passports asked for, in order. */
	get passports(): string[] {
		return this.requests.map((request) => request.passport);
	}

	readonly fetch = async (request: Request): Promise<Response> => {
		const body = (await request.clone().json()) as { data?: { attributes?: { passportCode?: string } } };
		const passport = body.data?.attributes?.passportCode ?? '';
		this.requests.push({ passport, request, body });
		const reply = this.#reply(passport);
		await this.#held;
		if (reply === 'network error') {
			throw new TypeError('fetch failed');
		}
		if (reply === 'no answer') {
			return new Promise((_, reject) => {
				request.signal.addEventListener('abort', () => {
					reject(request.signal.reason);
				});
			});
		}
		if ('status' in reply) {
			return Response.json({ errors: [{ status: String(reply.status) }] }, { status: reply.status });
		}
		return 'text' in reply ? new Response(reply.text, { status: 201 }) : Response.json(reply.body, { status: 201, headers: reply.headers });
	};
}

export const SHERPA_API_KEY = 'sherpa-test-key';

/**
 * The handler with its deps: a ring cache, a visa rules' store, a Sherpa, a PostHog and timers of its own unless given
 * ones, all on `clock`, and the shipped visa exemptions' table unless given rows. `get` sends GET /api/ring with `query` and waits for the handler's background work too; `request` does
 * not, and `settle` waits for it later.
 */
export function api({
	container,
	datasetVersion = DATASET,
	clock = { now: START },
	rings = new MemoryKv(clock),
	visaRules = new MemoryKv(clock),
	sherpa = new SherpaDouble(),
	visaExemptions = VISA_EXEMPTIONS,
	analytics = new AnalyticsDouble(),
	timers = new Timers(clock),
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
}) {
	const errors: unknown[][] = [];
	const background: Promise<unknown>[] = [];
	const deps: RingDeps = {
		rings,
		visaRules,
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
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
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
	return { get, request, settle, clock, timers, kv: rings, rings, visaRules, sherpa, errors, analytics, deps };
}
