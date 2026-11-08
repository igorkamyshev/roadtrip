// The ring API (spec «Решения по тестам», seam 2): the handler of GET /api/ring with its dependencies through
// `deps` (test/api.ts). Sherpa answers every country visa-free here unless a test says otherwise; the visa rules
// themselves are in visa-rules.test.ts. The border rules are the engine's seam, not repeated here.
import { fixtureGraph } from 'data/fixture-graph';
import { computeRing, dataVersion, type RingRequest } from 'engine';
import type { Graph } from 'engine/graph';
import { borderTable } from 'rules';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { answering, api, counted, DATASET, DAY, engineContainer, MemoryKv, recorded, SherpaDouble, sherpaMap, START, taking } from '../test/api.ts';
import { handleRing } from './ring.ts';

const straightRoad = fixtureGraph('straight-road.osm');

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
			access: expect.any(Object),
			visaRulesLoadedAt: '2026-11-07T00:00:00.000Z',
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

	it('gives one ring to citizenships with the same closed countries, and another to other closed countries', async () => {
		const container = counted(await engineContainer(straightRoad));
		const sherpa = new SherpaDouble();
		// Serbs and Montenegrins need a visa only for Croatia (and each other's country is open): the same closed
		// countries. Turks need none.
		sherpa.answer((passport) => ({
			body: sherpaMap(passport, { groups: passport === 'TUR' ? {} : { HRV: 'PAPER_OR_EMBASSY_VISA_REQUIRED' } }),
		}));
		const { get } = api({ container, sherpa });
		const ringOf = ({ body: { outcome, ring, startCountry, source } }: { body: Record<string, unknown> }) => ({ outcome, ring, startCountry, source });

		const serbian = await get('lat=0&lon=0&hours=2&cit=SRB');
		const montenegrin = await get('lat=0&lon=0&hours=2&cit=MNE');
		const both = await get('lat=0&lon=0&hours=2&cit=MNE,SRB');
		const turkish = await get('lat=0&lon=0&hours=2&cit=TUR');

		expect(ringOf(serbian)).toMatchObject({ outcome: 'ring', source: 'calculation' });
		expect(ringOf(montenegrin)).toEqual({ ...ringOf(serbian), source: 'cache' });
		expect(ringOf(both)).toEqual({ ...ringOf(serbian), source: 'cache' });
		expect(turkish.body.source).toBe('calculation');
		expect(container.calls).toBe(2);
	});

	it('misses for a new data version', async () => {
		const november = api({ container: await engineContainer(straightRoad, '2026-11-01') });
		const december = api({
			container: await engineContainer(straightRoad, '2026-12-01'),
			datasetVersion: '2026-12-01',
			clock: november.clock,
			rings: november.rings,
			visaRules: november.visaRules,
		});

		await november.get('lat=0&lon=0&hours=2&cit=RUS');

		expect((await december.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('calculation');
		expect((await december.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('cache');
		expect((await november.get('lat=0&lon=0&hours=2&cit=RUS')).body.source).toBe('cache');
	});

	it('that fails to take a ring logs it, and the ring is served', async () => {
		const rings = new MemoryKv({ now: START });
		const refused = new Error('KV PUT failed: 429 Too Many Requests');
		rings.put = () => Promise.reject(refused);
		const { get, errors } = api({ container: await engineContainer(straightRoad), rings });

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
			body: { outcome: 'empty', maxHours: 5, startCountry: 'AAA', access: expect.any(Object), visaRulesLoadedAt: expect.any(String), source: 'joined' },
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

describe('ring served', () => {
	const timings = { queueMs: 400, traversalMs: 1200, contourMs: 300 };

	it("tells a calculation: the outcome, N, how long the request took and the Container's timings", async () => {
		const clock = { now: START };
		const container = taking(2500, clock, await answering(200, { outcome: 'empty', maxHours: 5, startCountry: 'AAA', timings }));
		const { get, analytics } = api({ container, clock });

		await get('lat=0&lon=0&hours=6&cit=RUS');

		expect(analytics.named('ring served')).toEqual([
			{ source: 'calculation', outcome: 'empty', hours: 6, duration_ms: 2500, queue_ms: 400, traversal_ms: 1200, contour_ms: 300 },
		]);
	});

	it('tells the cold start of a calculation that waited for the Container to start', async () => {
		const container = await answering(200, { outcome: 'no_roads', startCountry: 'AAA', timings: { ...timings, coldStartMs: 14250 } });
		const { get, analytics } = api({ container });

		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('ring served')).toEqual([
			{ source: 'calculation', outcome: 'no_roads', hours: 2, duration_ms: 0, queue_ms: 400, traversal_ms: 1200, contour_ms: 300, cold_start_ms: 14250 },
		]);
	});

	it('tells a request joined to a calculation, with the timings of that calculation', async () => {
		const clock = { now: START };
		const container = taking(800, clock, await answering(200, { outcome: 'ring', ring: { type: 'MultiPolygon', coordinates: [] }, startCountry: 'AAA', joined: true, timings }));
		const { get, analytics } = api({ container, clock });

		await get('lat=0&lon=0&hours=3&cit=RUS');

		expect(analytics.named('ring served')).toEqual([
			{ source: 'joined', outcome: 'ring', hours: 3, duration_ms: 800, queue_ms: 400, traversal_ms: 1200, contour_ms: 300 },
		]);
	});

	it('tells a ring from the cache without timings', async () => {
		const { get, analytics } = api({ container: await engineContainer(straightRoad) });

		await get('lat=0&lon=0&hours=2&cit=RUS');
		await get('lat=0&lon=0&hours=2&cit=SRB');

		expect(analytics.named('ring served')).toEqual([
			expect.objectContaining({ source: 'calculation', outcome: 'ring', hours: 2 }),
			{ source: 'cache', outcome: 'ring', hours: 2, duration_ms: 0 },
		]);
	});

	it('tells visa_rules_missing without a source: neither the cache nor the Container was asked', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => ({ status: 503 }));
		const { get, analytics } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=4&cit=RUS');

		expect(analytics.named('ring served')).toEqual([{ outcome: 'visa_rules_missing', hours: 4, duration_ms: 0 }]);
	});

	it('tells a failed Container as an error of a calculation', async () => {
		const clock = { now: START };
		const container = taking(60_000, clock, { fetch: () => Promise.reject(new Error('Container failed to start')) });
		const { get, analytics } = api({ container, clock });

		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('ring served')).toEqual([{ source: 'calculation', outcome: 'error', hours: 2, duration_ms: 60_000 }]);
	});

	it('is not sent for a request that is no ring request: 400 and 405', async () => {
		const { get, analytics, deps } = api({ container: await engineContainer(straightRoad) });

		await get('lat=0&lon=0&hours=13&cit=RUS');
		await handleRing(new Request('https://roadtrip.kamyshev.me/api/ring?lat=0&lon=0&hours=2&cit=RUS', { method: 'POST' }), deps);

		expect(analytics.events).toEqual([]);
	});

	it("rounds the Container's timings to whole milliseconds", async () => {
		const container = await answering(200, { outcome: 'no_roads', startCountry: 'AAA', timings: { queueMs: 0.12, traversalMs: 1200.5, contourMs: 299.7, coldStartMs: 14250.4 } });
		const { get, analytics } = api({ container });

		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('ring served')).toEqual([expect.objectContaining({ queue_ms: 0, traversal_ms: 1201, contour_ms: 300, cold_start_ms: 14250 })]);
	});

	it('never carries the origin, not even rounded', async () => {
		const { get, analytics } = api({ container: await engineContainer(straightRoad) });

		await get('lat=0.0123&lon=0.0456&hours=2&cit=RUS');

		expect(analytics.named('ring served')).toEqual([expect.objectContaining({ outcome: 'ring' })]);
		expect(JSON.stringify(analytics.events)).not.toMatch(/0\.01|0\.04/u);
	});
});
