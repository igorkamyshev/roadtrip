// The ring API as the client sees it (spec #20 «API кольца»): `GET /api/ring`, the Worker's one endpoint for the
// client. The client imports these types from `worker/api`.
import type { LatLon } from 'engine';
import type { RingOutcome } from 'engine/protocol';

export type { LatLon };

/**
 * The Worker's domain (`routes` in wrangler.jsonc), the site's one host: the only one whose requests send the Worker's
 * events and the browser's to PostHog.
 */
export const PRODUCTION_HOST = 'roadtrip.kamyshev.me';

export const RING_PATH = '/api/ring';

/**
 * The query of `GET /api/ring`. Lists are comma-separated, sorted and without repeats; anything else is 400.
 *
 * - `lat`, `lon`: the origin in degrees, as the person set it (the Worker rounds it for the calculation and the
 *   cache);
 * - `hours`: N, a whole number from 1 to 12;
 * - `cit`: the citizenships, at least one, each one of Sherpa's passports (rules' `SHERPA_PASSPORTS`);
 * - `visas`: the held visas, `SCHENGEN` and the codes of the countries outside Schengen (rules' `HELD_VISAS`: those
 *   of `COUNTRIES`, alpha-3, `RKS`, `NX`); may be empty or left out.
 *
 * For example `/api/ring?lat=44.8125&lon=20.4612&hours=3&cit=RUS,SRB&visas=SCHENGEN`.
 */
export interface RingQuery {
	readonly origin: LatLon;
	readonly hours: number;
	readonly citizenships: readonly string[];
	readonly visas: readonly string[];
}

/** Where the ring came from: the ring cache, a calculation for this request, or one for the same ring that it joined. */
export type RingSource = 'cache' | 'calculation' | 'joined';

/**
 * How a country lets the person in (spec #20 «Визовые правила и сведение»), best first: without a visa, by a held visa,
 * a visa on arrival, an e-visa; `start` is the start country, open although the visa rules close it; `closed` is
 * never entered.
 */
export type EntryMode = 'visa_free' | 'held_visa' | 'visa_on_arrival' | 'evisa' | 'start' | 'closed';

/** A country's entry mode and where it came from. */
export interface CountryAccess {
	readonly mode: EntryMode;
	/** The citizenship whose visa rules give the mode, or whose own country this is. */
	readonly citizenship?: string;
	/**
	 * The held visa that gives it: `SCHENGEN` or an alpha-3. For `held_visa` always, and for an `evisa` that a row of
	 * the visa exemptions' table gives. A city's label says it: «по визе Шенгена», «по визе: <страна>».
	 */
	readonly visa?: string;
	/** Closed for everyone, whatever the citizenships and visas (#13): such a country is always `closed`. */
	readonly closedForEveryone?: true;
}

/**
 * The entry mode of every country (rules' `COUNTRIES`: alpha-3, `RKS`, `NX`) and every closed territory (its code),
 * by code.
 */
export type Access = Readonly<Record<string, CountryAccess>>;

/**
 * The answer 200 with a ring or the engine's reason for none, by `outcome` (spec #20 «API кольца»):
 *
 * - `ring`: `ring` is the ring, a GeoJSON MultiPolygon with holes, in [lon, lat];
 * - `empty`: the ring N is empty, nothing is reached after N − 1 hours; `maxHours` is the longest travel time to
 *   anywhere, rounded up;
 * - `no_roads`: no road within 50 km of the origin;
 * - `no_ring`: the origin is in a country or territory closed for everyone.
 *
 * `startCountry` is the zone of the origin (alpha-3, `NX` for Northern Cyprus, or a closed territory's code), null
 * for an origin at sea with no road near. `access` is the entry mode of every country for the citizenships and
 * visas, the start country's included; `visaRulesLoadedAt` is when the oldest of the citizenships' visa rules came
 * from Sherpa (ISO 8601).
 */
export type RingAnswer = RingOutcome & {
	readonly source: RingSource;
	readonly access: Access;
	readonly visaRulesLoadedAt: string;
};

/** The answer 200 when Sherpa's visa rules of a citizenship could not be had: no ring is calculated. */
export interface VisaRulesMissing {
	readonly outcome: 'visa_rules_missing';
	/** The first of the query's citizenships without visa rules. */
	readonly missingCitizenship: string;
}

export type RingResponse = RingAnswer | VisaRulesMissing;

/** The answer 400 to a query that is not a `RingQuery`, and 5xx when the Container or the Worker failed. */
export interface RingError {
	readonly error: string;
}
