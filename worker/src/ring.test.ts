// The ring API (spec «Решения по тестам», seam 2): the Worker's handler of GET /api/ring with its dependencies
// through `deps`. The Container is the engine server with the real engine in this process, on a graph the builder
// makes of an OSM fixture (data/test/fixtures, values worked out in each header); a failure, the queue and
// `joined` come from a double. KV is a double in memory whose entries expire by a clock the test moves. The
// border rules are the engine's seam, not repeated here.
import { fixtureGraph } from 'data/fixture-graph';
import { computeRing, dataVersion, type RingRequest } from 'engine';
import type { Graph } from 'engine/graph';
import { createEngineServer } from 'engine/server';
import { borderTable } from 'rules';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Container, handleRing, type RingDeps } from './ring.ts';

const DATASET = '2026-11-01';
const DAY = 24 * 60 * 60 * 1000;
const straightRoad = fixtureGraph('straight-road.osm');

/** The Container: the engine server in this process, calculating with the engine on `graph`. */
async function engineContainer(graph: Graph, dataset = DATASET): Promise<Container> {
	const server = createEngineServer({
		calculate: async (request) => computeRing(graph, borderTable, request),
		dataVersion: await dataVersion(dataset, borderTable),
	});
	return { fetch: (request) => server.fetch(request) };
}

/** Workers KV in memory: an entry is gone `expirationTtl` seconds after it was put, by `clock`. */
class MemoryKv {
	private readonly entries = new Map<string, { value: string; expiresAt: number }>();

	readonly clock = { now: Date.UTC(2026, 10, 7) };

	async get(key: string): Promise<string | null> {
		const entry = this.entries.get(key);
		return entry !== undefined && this.clock.now < entry.expiresAt ? entry.value : null;
	}

	async put(key: string, value: string, { expirationTtl }: { expirationTtl: number }): Promise<void> {
		this.entries.set(key, { value, expiresAt: this.clock.now + expirationTtl * 1000 });
	}
}

/**
 * The handler with its deps, a KV of its own unless given one; `get` sends GET /api/ring with `query` and waits for
 * the handler's background work too.
 */
function api({ container, datasetVersion = DATASET, kv = new MemoryKv() }: { container: Container; datasetVersion?: string; kv?: MemoryKv }) {
	const errors: unknown[][] = [];
	const background: Promise<unknown>[] = [];
	const deps: RingDeps = {
		rings: kv,
		container,
		datasetVersion,
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
	const get = async (query: string, headers: Record<string, string> = {}) => {
		const response = await handleRing(new Request(`https://roadtrip.kamyshev.me/api/ring?${query}`, { headers }), deps);
		await Promise.all(background.splice(0));
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	};
	return { get, clock: kv.clock, kv, errors, deps };
}

/** The engine's own result for a request from the rounded origin, for comparing with what the API passes on. */
function engineResult(graph: Graph, request: RingRequest) {
	const { timings: _, ...result } = computeRing(graph, borderTable, request);
	return result;
}

describe('GET /api/ring', () => {
	it('answers the ring the Container calculated', async () => {
		const { get } = api({ container: await engineContainer(straightRoad) });

		const { status, body } = await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(status).toBe(200);
		expect(body).toEqual({
			...engineResult(straightRoad, { origin: { lat: 0, lon: 0 }, hours: 2, closedCountries: [] }),
			source: 'calculation',
		});
		expect(body).toMatchObject({ outcome: 'ring', startCountry: 'AAA', ring: { type: 'MultiPolygon' } });
	});

	it.each([
		['ring', 'straight-road.osm', 'lat=0&lon=0&hours=2', { outcome: 'ring', startCountry: 'AAA' }],
		// The whole road takes 4.45 h of travel.
		['empty', 'straight-road.osm', 'lat=0&lon=0&hours=6', { outcome: 'empty', maxHours: 5, startCountry: 'AAA' }],
		// 51.1 km from the road.
		['no_roads', 'straight-road.osm', 'lat=0.46&lon=1&hours=3', { outcome: 'no_roads', startCountry: 'AAA' }],
		// In Abkhazia, closed for everyone.
		['no_ring', 'closed-territory.osm', 'lat=0.5&lon=1.2&hours=2', { outcome: 'no_ring', startCountry: 'ABKHAZIA' }],
	])('caches the outcome %s: the same request again comes from the ring cache, without the Container', async (_, fixture, query, outcome) => {
		const container = counted(await engineContainer(fixtureGraph(fixture)));
		const { get } = api({ container });

		const first = await get(`${query}&cit=RUS`);
		const again = await get(`${query}&cit=RUS`);

		expect(first).toMatchObject({ status: 200, body: { ...outcome, source: 'calculation' } });
		expect(again).toEqual({ status: 200, body: { ...first.body, source: 'cache' } });
		expect(container.calls).toBe(1);
	});
});

describe('the ring cache', () => {
	it('keeps a ring for 40 days', async () => {
		const container = counted(await engineContainer(straightRoad));
		const { get, clock } = api({ container });
		const start = clock.now;

		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = start + 40 * DAY - 1;
		expect((await get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('cache');
		clock.now = start + 40 * DAY;
		expect((await get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect(container.calls).toBe(2);
	});

	it('gives one ring to citizenships and visas with the same closed countries', async () => {
		const container = counted(await engineContainer(straightRoad));
		const { get } = api({ container });

		const russian = await get('lat=0&lon=0&hours=2&cit=RUS');
		const others = await get('lat=0&lon=0&hours=2&cit=DEU,TUR&visas=GBR,SCHENGEN,USA');

		expect(others).toEqual({ status: 200, body: { ...russian.body, source: 'cache' } });
		expect(container.calls).toBe(1);
	});

	it('misses for a new data version', async () => {
		const november = api({ container: await engineContainer(straightRoad, '2026-11-01') });
		const december = api({ container: await engineContainer(straightRoad, '2026-12-01'), datasetVersion: '2026-12-01', kv: november.kv });

		await november.get('lat=0&lon=0&hours=2&cit=RUS');

		expect((await december.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect((await december.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('cache');
		expect((await november.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('cache');
	});

	it('that fails to take a ring logs it, and the ring is served', async () => {
		const kv = new MemoryKv();
		const refused = new Error('KV PUT failed: 429 Too Many Requests');
		kv.put = () => Promise.reject(refused);
		const { get, errors } = api({ container: await engineContainer(straightRoad), kv });

		expect(await get('lat=0&lon=0&hours=2&cit=RUS')).toMatchObject({ status: 200, body: { outcome: 'ring', source: 'calculation' } });
		expect(errors).toEqual([['[ring] the ring cache did not take the ring', refused, { hours: 2 }]]);
	});

	it('takes no ring the Container calculated with other versions, as in a rollout, but serves it', async () => {
		const container = counted(await engineContainer(straightRoad, '2026-12-01'));
		const { get } = api({ container, datasetVersion: '2026-11-01' });

		const first = await get('lat=0&lon=0&hours=2&cit=RUS');
		const again = await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(first).toMatchObject({ status: 200, body: { outcome: 'ring', source: 'calculation' } });
		expect(again).toEqual(first);
		expect(container.calls).toBe(2);
	});

	// ~26 MB of JSON goes through the double, the handler and the test twice: seconds.
	it('takes no ring over 25 MiB, but serves it', { timeout: 15_000 }, async () => {
		// One ring of 700 000 points at full precision, ~40 bytes each in JSON.
		const points = 700_000;
		const ring = {
			type: 'MultiPolygon',
			coordinates: [[Array.from({ length: points }, (_, point) => [12.345678901234567 + point * 1e-9, 45.67890123456789])]],
		};
		const answer = JSON.stringify({
			outcome: 'ring',
			ring,
			startCountry: 'AAA',
			dataVersion: await dataVersion(DATASET, borderTable),
			joined: false,
			timings: { queueMs: 0, traversalMs: 2900, contourMs: 900 },
		});
		expect(answer.length).toBeGreaterThan(25 * 1024 * 1024 + 200); // all ASCII: characters are bytes
		const container = counted({ fetch: async () => new Response(answer) });
		const { get } = api({ container });

		const first = await get('lat=45.679&lon=12.346&hours=12&cit=RUS');
		const again = await get('lat=45.679&lon=12.346&hours=12&cit=RUS');

		expect(first).toMatchObject({ status: 200, body: { outcome: 'ring', startCountry: 'AAA', source: 'calculation' } });
		// The ring passes whole; a deep comparison of its points would take seconds.
		expect((first.body.ring as typeof ring).coordinates[0][0]).toHaveLength(points);
		expect((first.body.ring as typeof ring).coordinates[0][0][points - 1]).toEqual(ring.coordinates[0][0][points - 1]);
		expect(again.body.source).toBe('calculation');
		expect(container.calls).toBe(2);
	});
});

describe('the Container', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('answers joined to a request it joined to a calculation of the same ring, which caches it', async () => {
		const container = counted(await answering(200, { outcome: 'empty', maxHours: 5, startCountry: 'AAA', joined: true }));
		const { get } = api({ container });

		expect(await get('lat=0&lon=0&hours=6&cit=RUS')).toEqual({
			status: 200,
			body: { outcome: 'empty', maxHours: 5, startCountry: 'AAA', source: 'joined' },
		});
		expect((await get('lat=0&lon=0&hours=6&cit=RUS')).body.source).toBe('joined');
		expect(container.calls).toBe(2);
	});

	it('is waited for as long as its queue takes', async () => {
		vi.useFakeTimers();
		let release = () => {};
		const queued = new Promise<void>((resolve) => {
			release = resolve;
		});
		const engine = await engineContainer(straightRoad);
		const { get } = api({
			container: {
				fetch: async (request) => {
					await queued;
					return engine.fetch(request);
				},
			},
		});

		const answer = get('lat=0&lon=0&hours=2&cit=RUS');
		await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
		release();

		expect(await answer).toMatchObject({ status: 200, body: { outcome: 'ring', source: 'calculation' } });
	});

	const browser = { 'X-POSTHOG-DISTINCT-ID': '019a5f2c-browser', 'X-POSTHOG-SESSION-ID': '019a5f2c-session' };

	it('that failed answers 502, and its error goes to logger.error with its name, message and stack', async () => {
		const failure = {
			name: 'RangeError',
			message: 'Invalid typed array length: -1',
			stack: 'RangeError: Invalid typed array length: -1\n    at decodeGraph (file:///app/engine/src/graph.ts:182:10)',
		};
		const container = counted(await answering(500, failure));
		const { get, errors } = api({ container });

		expect(await get('lat=0&lon=0&hours=2&cit=RUS', browser)).toEqual({ status: 502, body: { error: 'The engine failed' } });
		expect(errors).toHaveLength(1);
		const [message, error, context] = errors[0];
		expect(message).toBe('[ring] the Container failed');
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject(failure);
		// The browser's PostHog ids, and never the origin.
		expect(context).toEqual({ distinct_id: '019a5f2c-browser', session_id: '019a5f2c-session', hours: 2 });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		expect(container.calls).toBe(2);
	});

	it('that could not be reached answers 502, and the error goes to logger.error', async () => {
		const unreachable = new Error('Container failed to start: the port 8080 is not ready after 120000 ms');
		const { get, errors } = api({ container: { fetch: () => Promise.reject(unreachable) } });

		expect((await get('lat=0&lon=0&hours=2&cit=RUS')).status).toBe(502);
		expect(errors).toEqual([['[ring] the Container failed', unreachable, { hours: 2 }]]);
	});

	it('that answered something else answers 502, and logger.error gets the status and the text', async () => {
		const container = { fetch: async () => new Response('There is no Container instance available at this time.', { status: 503 }) };
		const { get, errors } = api({ container });

		expect((await get('lat=0&lon=0&hours=2&cit=RUS')).status).toBe(502);
		expect(errors).toHaveLength(1);
		expect(errors[0][1]).toMatchObject({
			name: 'ContainerError',
			message: 'The Container answered 503: There is no Container instance available at this time.',
		});
	});
});

describe('a request', () => {
	it.each([
		['no origin', 'hours=2&cit=RUS'],
		['no longitude', 'lat=0&hours=2&cit=RUS'],
		['a latitude that is not a number', 'lat=north&lon=0&hours=2&cit=RUS'],
		['an empty latitude', 'lat=&lon=0&hours=2&cit=RUS'],
		['a latitude in another notation', 'lat=1e-3&lon=0&hours=2&cit=RUS'],
		['a latitude beyond 90°', 'lat=90.5&lon=0&hours=2&cit=RUS'],
		['a longitude beyond 180°', 'lat=0&lon=-180.01&hours=2&cit=RUS'],
		['two latitudes', 'lat=0&lat=1&lon=0&hours=2&cit=RUS'],
		['no N', 'lat=0&lon=0&cit=RUS'],
		['N of 0', 'lat=0&lon=0&hours=0&cit=RUS'],
		['N over 12', 'lat=0&lon=0&hours=13&cit=RUS'],
		['N that is not a whole number', 'lat=0&lon=0&hours=2.5&cit=RUS'],
		['no citizenship', 'lat=0&lon=0&hours=2'],
		['an empty list of citizenships', 'lat=0&lon=0&hours=2&cit='],
		['a citizenship that is not alpha-3', 'lat=0&lon=0&hours=2&cit=RU'],
		['a citizenship in lowercase', 'lat=0&lon=0&hours=2&cit=rus'],
		['citizenships out of order', 'lat=0&lon=0&hours=2&cit=TUR,RUS'],
		['a citizenship twice', 'lat=0&lon=0&hours=2&cit=RUS,RUS'],
		['an empty citizenship in the list', 'lat=0&lon=0&hours=2&cit=RUS,,TUR'],
		['a visa that is not a code', 'lat=0&lon=0&hours=2&cit=RUS&visas=SHENGEN'],
		['visas out of order', 'lat=0&lon=0&hours=2&cit=RUS&visas=USA,SCHENGEN'],
		['a visa twice', 'lat=0&lon=0&hours=2&cit=RUS&visas=GBR,GBR'],
	])('with %s is 400, and goes nowhere', async (_, query) => {
		const container = counted(await engineContainer(straightRoad));
		const { get } = api({ container });

		const { status, body } = await get(query);

		expect(status).toBe(400);
		expect(body).toEqual({ error: expect.any(String) });
		expect(container.calls).toBe(0);
	});

	it.each([
		['the smallest', 'lat=-90&lon=-180&hours=1&cit=AFG'],
		['the largest', 'lat=90&lon=180&hours=12&cit=ZWE'],
		['many citizenships and visas', 'lat=44.8125&lon=20.4612&hours=3&cit=DEU,RUS,SRB&visas=ARE,GBR,SCHENGEN,USA'],
		['no visas', 'lat=0&lon=0&hours=2&cit=RUS&visas='],
	])('with %s values is answered', async (_, query) => {
		const { get } = api({ container: await engineContainer(straightRoad) });

		expect((await get(query)).status).toBe(200);
	});

	it('other than GET is 405', async () => {
		const container = counted(await engineContainer(straightRoad));
		const response = await handleRing(new Request('https://roadtrip.kamyshev.me/api/ring?lat=0&lon=0&hours=2&cit=RUS', { method: 'POST' }), {
			...api({ container }).deps,
		});

		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET');
		expect(container.calls).toBe(0);
	});
});

describe('the origin', () => {
	it('goes to the calculation rounded to 0.001°, with N and the closed countries only', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container });

		await get('lat=0.00049&lon=0.10051&hours=2&cit=RUS,TUR&visas=SCHENGEN');

		expect(container.bodies).toEqual([{ origin: { lat: 0, lon: 0.101 }, hours: 2, closedCountries: [...borderTable.closedForEveryone].sort() }]);
	});

	it('shares the ring cache with every origin in its cell of 0.001°, and with no other', async () => {
		const container = counted(await engineContainer(straightRoad));
		const { get } = api({ container });

		expect((await get('lat=0.0004&lon=0.1004&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect((await get('lat=-0.0004&lon=0.0996&hours=2&cit=RUS')).body.source).toBe('cache');
		expect((await get('lat=0&lon=0.1&hours=2&cit=RUS')).body.source).toBe('cache');
		expect((await get('lat=0.0006&lon=0.1&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect((await get('lat=0&lon=0.1006&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect(container.calls).toBe(3);
	});
});

/**
 * A Container that answers every request with `status` and `body`; a 200's body is completed into a calculation of
 * the Worker's data version that did not wait.
 */
async function answering(status: number, body: object, dataset = DATASET): Promise<Container> {
	const calculation = {
		dataVersion: await dataVersion(dataset, borderTable),
		joined: false,
		timings: { queueMs: 0, traversalMs: 1200, contourMs: 300 },
		...body,
	};
	return { fetch: async () => Response.json(status === 200 ? calculation : body, { status }) };
}

/** `container`, keeping the body of each request it gets. */
function recorded(container: Container): Container & { bodies: unknown[] } {
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
function counted(container: Container): Container & { calls: number } {
	const result = {
		calls: 0,
		fetch: (request: Request) => {
			result.calls++;
			return container.fetch(request);
		},
	};
	return result;
}
