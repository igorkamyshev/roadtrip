// The ring API as the client sees it (spec «API кольца»): `GET /api/ring`, the Worker's one endpoint for the
// client. The client imports these types from `worker/api`.
import type { RingOutcome } from 'engine/protocol';

export const RING_PATH = '/api/ring';

/**
 * The query of `GET /api/ring`. Lists are comma-separated, sorted and without repeats; anything else is 400.
 *
 * - `lat`, `lon`: the origin in degrees, as the person set it (the Worker rounds it for the calculation and the
 *   cache);
 * - `hours`: N, a whole number from 1 to 12;
 * - `cit`: the citizenships, alpha-3, at least one;
 * - `visas`: the held visas, `SCHENGEN` and alpha-3 of countries outside Schengen; may be empty or left out.
 *
 * For example `/api/ring?lat=44.8125&lon=20.4612&hours=3&cit=RUS,SRB&visas=SCHENGEN`.
 */
export interface RingQuery {
	readonly origin: { readonly lat: number; readonly lon: number };
	readonly hours: number;
	readonly citizenships: readonly string[];
	readonly visas: readonly string[];
}

/** Where the ring came from: the ring cache, a calculation for this request, or one for the same ring that it joined. */
export type RingSource = 'cache' | 'calculation' | 'joined';

/**
 * The answer 200, by `outcome` (spec «API кольца»):
 *
 * - `ring`: `ring` is the ring, a GeoJSON MultiPolygon with holes, in [lon, lat];
 * - `empty`: the ring N is empty, nothing is reached after N − 1 hours; `maxHours` is the longest travel time to
 *   anywhere, rounded up;
 * - `no_roads`: no road within 50 km of the origin;
 * - `no_ring`: the origin is in a country or territory closed for everyone.
 *
 * `startCountry` is the zone of the origin (alpha-3, `NX` for Northern Cyprus, or a closed territory's code), null
 * for an origin at sea with no road near. The visa rules (#30) add `access`, `visaRulesLoadedAt` and the outcome
 * `visa_rules_missing` with `missingCitizenship`.
 */
export type RingResponse = RingOutcome & { readonly source: RingSource };

/** The answer 400 to a query that is not a `RingQuery`, and 5xx when the Container or the Worker failed. */
export interface RingError {
	readonly error: string;
}
