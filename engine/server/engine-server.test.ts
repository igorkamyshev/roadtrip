// The engine server of the Container (spec #20 «Container и очередь») through its HTTP interface: one calculation at a
// time, the others wait in order without a timeout, a request for a ring already being calculated gets the same
// result with `joined`, and a failure answers 500 with the error. The calculations here are a double that ends when
// the test says, on a clock the test moves; the engine itself on a graph file is in main.test.ts.
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MultiPolygon, RingRequest, RingResult } from '../src/index.ts';
import { isRecord } from '../src/json.ts';
import { COLD_START_HEADER } from '../src/protocol.ts';
import { createEngineServer } from './engine-server.ts';
import { listen } from './http.ts';

const DATA_VERSION = '2026-11-01.0123456789abcdef.2';
const RING: MultiPolygon = {
	type: 'MultiPolygon',
	coordinates: [
		[
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0],
			],
		],
	],
};

/** A ring result of the engine that took `traversalMs` and `contourMs`. */
function ringResult(traversalMs = 1200, contourMs = 300): RingResult {
	return { outcome: 'ring', ring: structuredClone(RING), startCountry: 'AAA', timings: { traversalMs, contourMs } };
}

/** A calculation from `lat`, by default from 0° of longitude, for 3 h, with no closed countries. */
function request(
	lat: number,
	{ lon = 0, hours = 3, closedCountries = [] }: { lon?: number; hours?: number; closedCountries?: string[] } = {},
): RingRequest {
	return { origin: { lat, lon }, hours, closedCountries };
}

/** The calculations the server started, in order; each ends when the test calls `finish` or `fail`. */
class Calculations {
	readonly started: RingRequest[] = [];
	private readonly running: Array<{ resolve: (result: RingResult) => void; reject: (error: unknown) => void }> = [];

	readonly calculate = (calculation: RingRequest): Promise<RingResult> =>
		new Promise((resolve, reject) => {
			this.started.push(calculation);
			this.running.push({ resolve, reject });
		});

	/** Ends the oldest running calculation. */
	finish(result: RingResult = ringResult()): void {
		this.next().resolve(result);
	}

	fail(error: unknown): void {
		this.next().reject(error);
	}

	private next() {
		const calculation = this.running.shift();
		if (calculation === undefined) {
			throw new Error('no calculation is running');
		}
		return calculation;
	}
}

const servers: Server[] = [];

afterEach(() => {
	for (const server of servers.splice(0)) {
		server.close();
	}
});

/** A server on a free port, with the calculations double and a clock at 0 that the test moves. */
async function startServer() {
	const calculations = new Calculations();
	const clock = { now: 0 };
	const engine = createEngineServer({ calculate: calculations.calculate, dataVersion: DATA_VERSION, now: () => clock.now });
	let received = 0;
	const server = await listen(
		{
			fetch: (incoming) => {
				received++;
				return engine.fetch(incoming);
			},
		},
		0,
	);
	servers.push(server);
	const address = server.address();
	if (address === null || typeof address === 'string') {
		throw new Error(`the server listens on ${address ?? 'nothing'}, not on a TCP port`);
	}
	const url = `http://127.0.0.1:${address.port}`;

	/** Posts `body` to the calculation path and resolves with the answer's status and JSON body. */
	const send = async (body: string, headers: Record<string, string> = {}) => {
		const response = await fetch(`${url}/ring`, { method: 'POST', body, headers });
		const answer: unknown = await response.json();
		if (!isRecord(answer)) {
			throw new Error(`the answer ${JSON.stringify(answer)} is not a JSON object`);
		}
		return { status: response.status, body: answer };
	};
	const post = (calculation: RingRequest, headers: Record<string, string> = {}) => send(JSON.stringify(calculation), headers);
	/** Waits until the server has received `count` requests in all. */
	const receivedAll = (count: number) =>
		vi.waitFor(() => {
			expect(received).toBe(count);
		});
	return { calculations, clock, send, post, receivedAll };
}

describe('the engine server', () => {
	it('answers a calculation with the engine’s result, the data version and the timings', async () => {
		const { calculations, post } = await startServer();

		const answer = post(request(0.5, { lon: 1.2, hours: 3, closedCountries: ['AFG', 'PRK'] }));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		calculations.finish(ringResult(1200, 300));

		expect(await answer).toEqual({
			status: 200,
			body: {
				outcome: 'ring',
				ring: RING,
				startCountry: 'AAA',
				dataVersion: DATA_VERSION,
				joined: false,
				timings: { queueMs: 0, traversalMs: 1200, contourMs: 300 },
			},
		});
		expect(calculations.started).toEqual([request(0.5, { lon: 1.2, hours: 3, closedCountries: ['AFG', 'PRK'] })]);
	});

	it('calculates one ring at a time, and the others wait in order and say for how long', async () => {
		const { calculations, clock, post, receivedAll } = await startServer();

		const first = post(request(1));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		const second = post(request(2));
		const third = post(request(3));
		await receivedAll(3);
		expect(calculations.started).toEqual([request(1)]);

		// The first takes 5 s and the second 3 s: the second waits 5 s, the third 8 s.
		clock.now = 5000;
		calculations.finish();
		await vi.waitFor(() => {
			expect(calculations.started).toEqual([request(1), request(2)]);
		});
		clock.now = 8000;
		calculations.finish();
		await vi.waitFor(() => {
			expect(calculations.started).toEqual([request(1), request(2), request(3)]);
		});
		calculations.finish();

		expect((await first).body.timings).toMatchObject({ queueMs: 0 });
		expect((await second).body.timings).toMatchObject({ queueMs: 5000 });
		expect((await third).body.timings).toMatchObject({ queueMs: 8000 });
	});

	it('gives a request for a ring being calculated that calculation’s result, with joined', async () => {
		const { calculations, clock, post, receivedAll } = await startServer();

		const first = post(request(1, { closedCountries: ['AFG', 'PRK'] }));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		clock.now = 1000;
		const same = post(request(1, { closedCountries: ['AFG', 'PRK'] }));
		await receivedAll(2);
		clock.now = 4000;
		calculations.finish(ringResult(3500, 500));

		expect(await first).toMatchObject({ status: 200, body: { outcome: 'ring', joined: false } });
		expect(await same).toEqual({
			status: 200,
			body: {
				outcome: 'ring',
				ring: RING,
				startCountry: 'AAA',
				dataVersion: DATA_VERSION,
				joined: true,
				timings: { queueMs: 0, traversalMs: 3500, contourMs: 500 },
			},
		});
		expect(calculations.started).toHaveLength(1);
	});

	it('joins a calculation that still waits in the queue', async () => {
		const { calculations, post, receivedAll } = await startServer();

		const first = post(request(1));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		const second = post(request(2));
		const same = post(request(2));
		await receivedAll(3);
		calculations.finish();
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(2);
		});
		calculations.finish();

		expect((await first).body).toMatchObject({ joined: false });
		expect((await second).body).toMatchObject({ joined: false });
		expect((await same).body).toMatchObject({ joined: true });
		expect(calculations.started).toEqual([request(1), request(2)]);
	});

	it('calculates again a ring whose calculation has ended', async () => {
		const { calculations, post } = await startServer();

		const first = post(request(1));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		calculations.finish();
		await first;
		const again = post(request(1));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(2);
		});
		calculations.finish();

		expect((await again).body).toMatchObject({ joined: false });
	});

	it('answers 500 with the error’s name, message and stack when a calculation fails, and goes on', async () => {
		const { calculations, post, receivedAll } = await startServer();
		const error = new RangeError('Invalid typed array length: -1');

		const failed = post(request(1));
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		const joined = post(request(1));
		const next = post(request(2));
		await receivedAll(3);
		calculations.fail(error);
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(2);
		});
		calculations.finish();

		const failure = { status: 500, body: { name: 'RangeError', message: 'Invalid typed array length: -1', stack: error.stack } };
		expect(await failed).toEqual(failure);
		expect(await joined).toEqual(failure);
		expect(await next).toMatchObject({ status: 200, body: { outcome: 'ring' } });
	});

	it.each([
		['not JSON', 'lat=1'],
		['no origin', { hours: 3, closedCountries: [] }],
		['a latitude that is not a number', { origin: { lat: '1', lon: 0 }, hours: 3, closedCountries: [] }],
		['no N', { origin: { lat: 1, lon: 0 }, closedCountries: [] }],
		['N that is not a whole number of hours', { origin: { lat: 1, lon: 0 }, hours: 2.5, closedCountries: [] }],
		['no closed countries', { origin: { lat: 1, lon: 0 }, hours: 3 }],
		['a closed country that is not a code', { origin: { lat: 1, lon: 0 }, hours: 3, closedCountries: [3] }],
	])('answers 400 to a calculation with %s, and calculates nothing', async (_, body) => {
		const { calculations, send } = await startServer();

		expect((await send(typeof body === 'string' ? body : JSON.stringify(body))).status).toBe(400);
		expect(calculations.started).toEqual([]);
	});

	it('passes on how long the request waited for the Container to start', async () => {
		const { calculations, post } = await startServer();

		const answer = post(request(1), { [COLD_START_HEADER]: '14250' });
		await vi.waitFor(() => {
			expect(calculations.started).toHaveLength(1);
		});
		calculations.finish(ringResult(1200, 300));

		expect((await answer).body.timings).toEqual({ queueMs: 0, traversalMs: 1200, contourMs: 300, coldStartMs: 14250 });
	});
});
