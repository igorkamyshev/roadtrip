// The Container with the engine server, as GET /api/ring asks it (spec #20 «Container и очередь», engine/protocol): the
// calculation it posts, and the answer checked before the Worker serves or caches it.
import {
	type Calculation,
	CALCULATION_PATH,
	type CalculationRequest,
	type CalculationTimings,
	legacyHours,
	type RingOutcome,
} from 'engine/protocol';
import { isRecord } from 'engine/json';

/** The Container with the engine server (engine/server): its answer to the request as it gave it. */
export interface Container {
	readonly fetch: (request: Request) => Promise<Response>;
}

/** A failure of the Container other than the engine's own error: it could not start, or answered something else. */
class ContainerError extends Error {
	override name = 'ContainerError';
}

/** The Container's calculation; throws its failure as an Error with the engine's name, message and stack. */
export async function calculate(calculation: CalculationRequest, container: Container): Promise<Calculation> {
	const response = await container.fetch(
		new Request(`http://engine${CALCULATION_PATH}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...calculation, ...legacyHours(calculation) }),
		}),
	);
	const text = await response.text();
	if (response.status === 200) {
		const answer: unknown = JSON.parse(text);
		if (isCalculation(answer)) {
			return answer;
		}
	}
	throw engineError(response.status, text) ?? new ContainerError(`The Container answered ${response.status}: ${text.slice(0, 1000)}`);
}

/**
 * The engine's error from the engine server's 500 `{ name, message, stack }`, rebuilt into an Error: the Tail
 * Worker reads an Error's name, message and stack, not a plain object's (error-tracking/README.md).
 */
function engineError(status: number, text: string): Error | undefined {
	if (status !== 500) {
		return undefined;
	}
	let failure: unknown;
	try {
		failure = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!isRecord(failure)) {
		return undefined;
	}
	const { name, message, stack } = failure;
	return typeof name === 'string' && typeof message === 'string' && typeof stack === 'string'
		? Object.assign(new Error(message), { name, stack })
		: undefined;
}

/**
 * The engine's outcome, as the Container answers it and the ring cache keeps it: its fields are checked, the ring's
 * points are not.
 */
export function isRingOutcome(value: unknown): value is RingOutcome {
	if (!isRecord(value) || !(typeof value.startCountry === 'string' || value.startCountry === null)) {
		return false;
	}
	switch (value.outcome) {
		case 'ring': {
			return isRecord(value.ring) && value.ring.type === 'MultiPolygon' && Array.isArray(value.ring.coordinates);
		}
		case 'empty': {
			return typeof value.maxHours === 'number';
		}
		case 'no_roads':
		case 'no_ring': {
			return true;
		}
		default: {
			return false;
		}
	}
}

/** The answer 200: an outcome with the data version it was calculated with, whether it joined, and the timings. */
function isCalculation(value: unknown): value is Calculation {
	return (
		isRecord(value) &&
		typeof value.dataVersion === 'string' &&
		typeof value.joined === 'boolean' &&
		isTimings(value.timings) &&
		isRingOutcome(value)
	);
}

function isTimings(value: unknown): value is CalculationTimings {
	return (
		isRecord(value) &&
		typeof value.queueMs === 'number' &&
		typeof value.traversalMs === 'number' &&
		typeof value.contourMs === 'number' &&
		(value.coldStartMs === undefined || typeof value.coldStartMs === 'number')
	);
}
