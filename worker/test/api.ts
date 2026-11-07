// The ring API's seam (spec «Решения по тестам», seam 2) and its doubles: the handler of GET /api/ring with its
// dependencies through `deps`. The Container is the engine server with the real engine in this process, on a graph
// the builder makes of an OSM fixture (data/test/fixtures, values worked out in each header), or a double. Sherpa
// is a faked `fetch`. Both KV namespaces are doubles in memory whose entries expire by one clock the test moves,
// the clock the handler reads too.
import { computeRing, dataVersion } from 'engine';
import type { Graph } from 'engine/graph';
import { createEngineServer } from 'engine/server';
import { borderTable, COUNTRIES } from 'rules';
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
 * How the double answers a passport: 201 with a body (`sherpaMap`'s, or any JSON or text), another status, a dropped
 * connection, or nothing until the request is aborted.
 */
export type SherpaReply = { readonly body: unknown } | { readonly text: string } | { readonly status: number } | 'network error' | 'no answer';

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
		return 'text' in reply ? new Response(reply.text, { status: 201 }) : Response.json(reply.body, { status: 201 });
	};
}

export const SHERPA_API_KEY = 'sherpa-test-key';

/**
 * The handler with its deps: a ring cache, a visa rules' store and a Sherpa of its own unless given ones, all on
 * `clock`. `get` sends GET /api/ring with `query` and waits for the handler's background work too; `request` does
 * not, and `settle` waits for it later.
 */
export function api({
	container,
	datasetVersion = DATASET,
	clock = { now: START },
	rings = new MemoryKv(clock),
	visaRules = new MemoryKv(clock),
	sherpa = new SherpaDouble(),
}: {
	container: Container;
	datasetVersion?: string;
	clock?: Clock;
	rings?: MemoryKv;
	visaRules?: MemoryKv;
	sherpa?: SherpaDouble;
}) {
	const errors: unknown[][] = [];
	const background: Promise<unknown>[] = [];
	const deps: RingDeps = {
		rings,
		visaRules,
		container,
		datasetVersion,
		fetch: sherpa.fetch,
		sherpaApiKey: SHERPA_API_KEY,
		now: () => clock.now,
		waitUntil: (promise) => {
			background.push(promise);
		},
		logger: {
			error: (...args) => {
				errors.push(args);
			},
			info: () => {},
		},
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
	return { get, request, settle, clock, kv: rings, rings, visaRules, sherpa, errors, deps };
}
