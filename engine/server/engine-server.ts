// The engine server of the Container (spec #20 «Container и очередь»): `POST /ring` with a calculation, answered with
// the engine's result, the data version and the timings, or 500 with the error. Web-standard Request and Response
// only: http.ts serves it under Node in the Container, and the Worker's tests call it in their own process.
import type { RingResult } from '../src/index.ts';
import { isRecord } from '../src/json.ts';
import {
	type Calculation,
	CALCULATION_PATH,
	type CalculationFailure,
	type CalculationRequest,
	calculationFailure,
	COLD_START_HEADER,
} from '../src/protocol.ts';

export interface EngineServerDeps {
	/** Computes one ring: the engine on the loaded graph and border table. */
	readonly calculate: (request: CalculationRequest) => Promise<RingResult>;
	/** The data version of that graph and table (engine's `dataVersion`). */
	readonly dataVersion: string;
	/** Milliseconds on a monotonic clock. */
	readonly now?: () => number;
}

export interface EngineServer {
	readonly fetch: (request: Request) => Promise<Response>;
}

/** How a calculation ended, and when it started. */
type Done = { readonly started: number } & ({ readonly result: RingResult } | { readonly failure: CalculationFailure });

export function createEngineServer({ calculate, dataVersion, now = () => performance.now() }: EngineServerDeps): EngineServer {
	// The calculations run one at a time, in the order they came: each starts when the one before it ends. There is
	// no timeout: a request waits as long as the queue takes.
	let queue: Promise<unknown> = Promise.resolve();
	// The calculations queued or running, by their key: a request for one of them waits for it and gets its result.
	const pending = new Map<string, Promise<Done>>();

	function enqueue(calculation: CalculationRequest): Promise<Done> {
		const done = queue.then(async (): Promise<Done> => {
			const started = now();
			try {
				return { started, result: await calculate(calculation) };
			} catch (error) {
				return { started, failure: calculationFailure(error) };
			}
		});
		queue = done;
		return done;
	}

	return {
		async fetch(request) {
			const arrived = now();
			if (new URL(request.url).pathname !== CALCULATION_PATH) {
				return json(404, { error: 'not found' });
			}
			const calculation = parseCalculation(await request.text());
			if (calculation === undefined) {
				return json(400, { error: 'a calculation is { origin: { lat, lon }, hours, closedCountries } in JSON' });
			}
			const key = calculationKey(calculation);
			let calculated = pending.get(key);
			const joined = calculated !== undefined;
			if (calculated === undefined) {
				calculated = enqueue(calculation);
				pending.set(key, calculated);
				void calculated.then(() => pending.delete(key));
			}
			const done = await calculated;
			if ('failure' in done) {
				return json(500, done.failure);
			}
			const { timings, ...outcome } = done.result;
			const coldStart = request.headers.get(COLD_START_HEADER);
			const coldStartMs = coldStart === null ? Number.NaN : Number(coldStart);
			const answer: Calculation = {
				...outcome,
				dataVersion,
				joined,
				timings: {
					queueMs: Math.max(0, done.started - arrived),
					...timings,
					...(Number.isFinite(coldStartMs) ? { coldStartMs } : {}),
				},
			};
			return json(200, answer);
		},
	};
}

/** The calculation in a request's body, or undefined when the body is not one. */
function parseCalculation(body: string): CalculationRequest | undefined {
	let value: unknown;
	try {
		value = JSON.parse(body);
	} catch {
		return undefined;
	}
	if (!isRecord(value) || !isRecord(value.origin)) {
		return undefined;
	}
	const { lat, lon } = value.origin;
	const { hours, closedCountries } = value;
	if (!isCoordinate(lat) || !isCoordinate(lon) || !isHours(hours) || !isCodes(closedCountries)) {
		return undefined;
	}
	return { origin: { lat, lon }, hours, closedCountries };
}

function isCoordinate(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/** N, a whole number of hours. */
function isHours(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isCodes(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((code) => typeof code === 'string');
}

/** The same origin, N and set of closed countries give the same ring. */
function calculationKey({ origin, hours, closedCountries }: CalculationRequest): string {
	return JSON.stringify([origin.lat, origin.lon, hours, closedCountries.toSorted()]);
}

function json(status: number, body: Calculation | CalculationFailure | { error: string }): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
