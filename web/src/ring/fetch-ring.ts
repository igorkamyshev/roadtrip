// `GET /api/ring` from the browser: the one place a ring request starts and ends (#34 measures it here). An
// answer 200 is data whatever its `outcome`; a block by the WAF (429) and anything else that is not 200, the
// network's failure included, is a `RingRequestError` the first card shows.
import { RING_PATH, type RingQuery, type RingResponse } from 'worker/api';

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
 * The ring for `query`. Takes no abort signal (spec «Состояние, ссылка и память браузера»): an answer that comes
 * after the person moved on still goes to the memory of rings, it is only not shown.
 */
export async function fetchRing(query: RingQuery): Promise<RingResponse> {
	let response: Response;
	try {
		// The global fetch, looked up at the call: posthog-js wraps it to add its tracing headers (#34).
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
	return (await response.json()) as RingResponse;
}

/** `/api/ring?lat=44.81760&lon=20.45730&hours=3&cit=RUS,SRB&visas=SCHENGEN`, `visas` left out when there are none. */
export function ringUrl({ origin, hours, citizenships, visas }: RingQuery): string {
	const params = new URLSearchParams({
		lat: origin.lat.toFixed(5),
		lon: origin.lon.toFixed(5),
		hours: String(hours),
		cit: citizenships.join(','),
	});
	if (visas.length > 0) {
		params.set('visas', visas.join(','));
	}
	return `${RING_PATH}?${params.toString().replaceAll('%2C', ',')}`;
}
