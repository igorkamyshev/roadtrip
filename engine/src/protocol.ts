// What the Worker and the engine server in the Container say to each other (spec «Container и очередь», «Кэш
// колец»). The Worker posts the fields of the ring's cache key but the data version; the server answers with the
// engine's result, the data version it calculated with, and the timings. The server is in server/, the Worker in
// the worker package.
import type { RingRequest, RingResult } from './index.ts';

/** POST a `CalculationRequest` as JSON here. */
export const CALCULATION_PATH = '/ring';

/**
 * How long the request waited for the Container to start, in ms. The Container's Durable Object sets it on a
 * request it had to start the Container for, and the server passes it on in the timings.
 */
export const COLD_START_HEADER = 'x-cold-start-ms';

/** The origin rounded by the Worker, N and the sorted closed countries: only the fields of the cache key. */
export type CalculationRequest = RingRequest;

type WithoutTimings<Result> = Result extends unknown ? Omit<Result, 'timings'> : never;

/** The engine's result without its timings: what the ring cache keeps. */
export type RingOutcome = WithoutTimings<RingResult>;

export interface CalculationTimings {
	/** Waiting behind other calculations, in ms. */
	readonly queueMs: number;
	/** Snapping the origin to a road and the traversal, in ms. */
	readonly traversalMs: number;
	/** Building the ring's contour, in ms. */
	readonly contourMs: number;
	/** Waiting for the Container to start, in ms, when the request did. */
	readonly coldStartMs?: number;
}

/** The answer 200. */
export type Calculation = RingOutcome & {
	/** The data version of the graph and the border table the server calculated with (engine's `dataVersion`). */
	readonly dataVersion: string;
	/** The request came while the same ring was being calculated or waited for it, and got that calculation's result. */
	readonly joined: boolean;
	readonly timings: CalculationTimings;
};

/** The answer 500: the error the calculation threw. */
export interface CalculationFailure {
	readonly name: string;
	readonly message: string;
	readonly stack: string;
}

/** Whatever was thrown, as the answer 500 carries it. */
export function calculationFailure(error: unknown): CalculationFailure {
	return error instanceof Error
		? { name: error.name, message: error.message, stack: error.stack ?? '' }
		: { name: 'Error', message: String(error), stack: '' };
}
