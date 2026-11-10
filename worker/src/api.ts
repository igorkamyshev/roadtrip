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

/** The slider's hours: the rings of 1…MAX_HOURS hours (spec #20 «Экран», «Ползунок»). */
export const MAX_HOURS = 12;

/** A day is this many hours of travel in a row, without nights or borders closed at night (GLOSSARY «День»). */
export const HOURS_PER_DAY = 12;

/**
 * The slider's last day: its days are 2…MAX_DAYS, after the hours (#82). The largest D ≤ 5 whose warm ring from the
 * centre of Europe takes at most 10 s under standard-2's limits, by the bench in docs/container-bench.md.
 */
export const MAX_DAYS = 5;

/** A ring's bounds in hours of travel: it holds the places reached in (lowerHours, upperHours]. */
export interface RingBounds {
	readonly lowerHours: number;
	readonly upperHours: number;
}

/**
 * The slider's cells from the bottom, each by its upper bound in hours, which names it alone: the hours 1…MAX_HOURS,
 * then the days 2…MAX_DAYS as 24, 36, … (day 1 is none, its hours are).
 */
export const SLIDER_CELLS: readonly number[] = [
	...Array.from({ length: MAX_HOURS }, (_, at) => at + 1),
	...Array.from({ length: MAX_DAYS - 1 }, (_, at) => HOURS_PER_DAY * (at + 2)),
];

/**
 * The ring of the slider's cell with this upper bound: N hours is (N − 1, N], day D is (12·(D − 1), 12·D]
 * (GLOSSARY «Кольцо»).
 */
export function cellRing(upperHours: number): RingBounds {
	return { lowerHours: upperHours - (upperHours > MAX_HOURS ? HOURS_PER_DAY : 1), upperHours };
}

/**
 * Whether `GET /api/ring` takes these bounds: a ring of one hour, (N − 1, N] for N from 1 to the last day's end,
 * 12·MAX_DAYS, or a day's, (12·(D − 1), 12·D] for D from 2 to MAX_DAYS (#82). The slider asks for its cells only.
 */
export function isScaleRing({ lowerHours, upperHours }: RingBounds): boolean {
	if (!Number.isInteger(upperHours) || upperHours < 1 || upperHours > HOURS_PER_DAY * MAX_DAYS) {
		return false;
	}
	return (
		lowerHours === upperHours - 1 ||
		(upperHours > MAX_HOURS && lowerHours === cellRing(upperHours).lowerHours && upperHours % HOURS_PER_DAY === 0)
	);
}

/**
 * The query of `GET /api/ring`. Lists are comma-separated, sorted and without repeats; anything else is 400.
 *
 * - `lat`, `lon`: the origin in degrees, as the person set it (the Worker rounds it for the calculation and the
 *   cache);
 * - `from`, `to`: the ring's bounds in hours (`isScaleRing`): the ring of N hours is `from=N−1&to=N`, N from 1 to
 *   12·MAX_DAYS, the ring of day D is `from=12·(D−1)&to=12·D`, D from 2 to MAX_DAYS;
 * - `cit`: the citizenships, at least one, each one of Sherpa's passports (rules' `SHERPA_PASSPORTS`);
 * - `visas`: the held visas, `SCHENGEN` and the codes of the countries outside Schengen (rules' `HELD_VISAS`: those
 *   of `COUNTRIES`, alpha-3, `RKS`, `NX`); may be empty or left out.
 *
 * For example `/api/ring?lat=44.8125&lon=20.4612&from=2&to=3&cit=RUS,SRB&visas=SCHENGEN`, or `from=12&to=24` for
 * day 2.
 */
export interface RingQuery extends RingBounds {
	readonly origin: LatLon;
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
	 * the visa exemptions' table gives. The client does not show it (#73).
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
 * - `empty`: the ring is empty, nothing is reached after its lower bound; `maxHours` is the longest travel time
 *   to anywhere, rounded up;
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
