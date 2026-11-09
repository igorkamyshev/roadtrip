// What the Worker and the engine server in the Container say to each other (spec #20 «Container и очередь», «Кэш
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

/**
 * The origin rounded by the Worker, the ring's two bounds and the sorted closed countries: only the fields of the
 * cache key.
 *
 * Before the two bounds (#82) a calculation carried N alone, `hours`. In a rollout:
 *
 * - a Container from before them reads only `hours` and answers 400 without it. The Worker adds `hours`, the upper
 *   bound, to a ring of one hour, (N − 1, N], which such a Container calculates as it should (`legacyHours`); a ring
 *   of days fails with 502 until the Container moves too.
 * - the Container takes a lone `hours` from a Worker from before them as the ring (N − 1, N].
 */
export type CalculationRequest = RingRequest;

/** What a Worker sends a Container from before the two bounds besides them: N of a ring of one hour, or nothing. */
export function legacyHours({ lowerHours, upperHours }: CalculationRequest): { readonly hours?: number } {
	return upperHours - lowerHours === 1 ? { hours: upperHours } : {};
}

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
