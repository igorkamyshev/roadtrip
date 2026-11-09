// `GET /api/ring` from the browser: the one place a ring request starts and ends. An answer 200 is data whatever its
// `outcome`; a block by the WAF (429), anything else that is not 200 or not an answer of the API, and the network's
// failure are a `RingRequestError` the first card shows, and `ring result` tells (src/analytics/).
import { RING_PATH, type RingQuery, type RingResponse } from 'worker/api';
import { analyticsStarted } from '../analytics/posthog.ts';

/** Why the ring did not come: Cloudflare's block for too many requests, or any other failure. */
export type RingFailure = 'too_many_requests' | 'error';

export class RingRequestError extends Error {
	override readonly name = 'RingRequestError';

	constructor(
		readonly failure: RingFailure,
		readonly status?: number,
	) {
		super(status === undefined ? `ring request failed: ${failure}` : `ring request failed: ${failure} (${status})`);
	}
}

/**
 * The ring for `query`. Takes no abort signal (spec #20 «Состояние, ссылка и память браузера»): an answer that comes
 * after the person moved on still goes to the memory of rings, it is only not shown.
 */
export async function fetchRing(query: RingQuery): Promise<RingResponse> {
	// On the production host, once posthog-js is up: it wraps the global fetch to add its tracing headers.
	await analyticsStarted();
	let response: Response;
	try {
		// The global fetch, looked up at the call, as posthog-js wrapped it.
		response = await fetch(ringUrl(query));
	} catch {
		throw new RingRequestError('error');
	}
	if (response.status === 429) {
		throw new RingRequestError('too_many_requests', 429);
	}
	if (!response.ok) {
		throw new RingRequestError('error', response.status);
	}
	const answer: unknown = await response.json();
	if (!isRingResponse(answer)) {
		throw new RingRequestError('error', response.status);
	}
	return answer;
}

/** Every `outcome` an answer 200 has (worker/api). */
const OUTCOMES: Readonly<Record<RingResponse['outcome'], true>> = {
	ring: true,
	empty: true,
	no_roads: true,
	no_ring: true,
	visa_rules_missing: true,
};

/** An answer 200 of the ring API: an object with one of its outcomes. The rest of its form is the Worker's (worker/api). */
function isRingResponse(answer: unknown): answer is RingResponse {
	return (
		typeof answer === 'object' &&
		answer !== null &&
		'outcome' in answer &&
		typeof answer.outcome === 'string' &&
		Object.keys(OUTCOMES).includes(answer.outcome)
	);
}

/** `/api/ring?lat=44.81760&lon=20.45730&from=2&to=3&cit=RUS,SRB&visas=SCHENGEN`, `visas` left out when there are none. */
function ringUrl({ origin, lowerHours, upperHours, citizenships, visas }: RingQuery): string {
	const params = new URLSearchParams({
		lat: origin.lat.toFixed(5),
		lon: origin.lon.toFixed(5),
		from: String(lowerHours),
		to: String(upperHours),
		cit: citizenships.join(','),
	});
	if (visas.length > 0) {
		params.set('visas', visas.join(','));
	}
	return `${RING_PATH}?${params.toString().replaceAll('%2C', ',')}`;
}
