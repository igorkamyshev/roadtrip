// The reduction of the visa rules (spec «Визовые правила и сведение», «Сведение»; #11): one pure function from the
// citizenships' Sherpa classes, the held visas and the visa exemptions' rows acting today to the entry mode of every
// country and where it came from: a citizenship, or a held visa (`visa`, which the cities' labels name). The
// client gets its result as `access`; the calculation avoids its closed countries, and the ring cache's key holds
// them instead of the citizenships and visas, so combinations that close the same countries share their rings.
import { actingExemptions, borderTable, COUNTRIES, EXEMPTION_VISAS, SCHENGEN, SCHENGEN_AREA, type VisaExemption } from 'rules';
import type { Access, CountryAccess, EntryMode } from './api.ts';
import type { SherpaClass, SherpaClasses } from './sherpa.ts';

export interface VisaRulesInput {
	/** Alpha-3, sorted. */
	readonly citizenships: readonly string[];
	/** Sherpa's classes of each citizenship. */
	readonly sherpa: ReadonlyMap<string, SherpaClasses>;
	/** The held visas: `SCHENGEN` and alpha-3 outside Schengen. */
	readonly heldVisas: readonly string[];
	/** The visa exemptions' table (rules' `VISA_EXEMPTIONS`). */
	readonly exemptions: readonly VisaExemption[];
	/** Today's date in UTC, YYYY-MM-DD: a row acts up to its last day. */
	readonly today: string;
}

export interface Reduction {
	readonly access: Access;
	/**
	 * The closed countries (spec «Набор закрытых стран»): alpha-3 (and `NX`) closed by the reduction, those closed
	 * for everyone included, sorted, without the start country's correction. What the engine avoids and the ring
	 * cache's key hashes.
	 */
	readonly closed: readonly string[];
}

/** A class's entry mode; the classes not here close the country, as does no class at all. */
const MODE_OF_CLASS: ReadonlyMap<SherpaClass, EntryMode> = new Map<SherpaClass, EntryMode>([
	['NO_VISA_REQUIRED', 'visa_free'],
	['VISA_ON_ARRIVAL_REQUIRED', 'visa_on_arrival'],
	['EVISA_OR_ETA_REQUIRED', 'evisa'],
]);

/** Best first (rule 3). */
const RANK: Readonly<Record<EntryMode, number>> = { visa_free: 0, start: 0, held_visa: 1, visa_on_arrival: 2, evisa: 3, closed: 4 };

const CLOSED: CountryAccess = { mode: 'closed' };
const CLOSED_FOR_EVERYONE: CountryAccess = { mode: 'closed', closedForEveryone: true };

/**
 * The entry mode of every country (rules' `COUNTRIES`) and closed territory, by the rules in order:
 *
 * 1. a country or territory closed for everyone is closed;
 * 2. a country of any of the citizenships is open without a visa;
 * 3. otherwise the best mode among the citizenships' classes and the held visas: without a visa, by a held visa, a
 *    visa on arrival, an e-visa, else closed.
 *    - A held visa of a country opens it, `SCHENGEN` the whole Schengen area: by a held visa.
 *    - A row of the exemptions' table acting today for one of the citizenships opens its country to a holder of its
 *      visa: by a held visa, or an e-visa for a row that gives one.
 *
 * Between sources that give the same mode the first stays: the citizenships in their order, then the country's own
 * visa or Schengen, then the rows of Schengen, the USA, the UK and Canada, in that order (`EXEMPTION_VISAS`).
 */
export function reduceVisaRules(input: VisaRulesInput): Reduction {
	const best: Offers = new Map();
	offerByCitizenships(best, input);
	offerByHeldVisas(best, input.heldVisas);
	offerByExemptions(best, input);
	return reduction(best, input.citizenships);
}

/** The best mode offered for each country so far, and where it came from (rule 3). */
type Offers = Map<string, CountryAccess>;

/** A better mode replaces the one there; an equal one does not, so the first offered stays. */
function offer(best: Offers, country: string, entry: CountryAccess): void {
	const current = best.get(country);
	if (current === undefined || RANK[entry.mode] < RANK[current.mode]) {
		best.set(country, entry);
	}
}

/** The citizenships' classes, in the citizenships' order. */
function offerByCitizenships(best: Offers, { citizenships, sherpa }: VisaRulesInput): void {
	for (const citizenship of citizenships) {
		const classes = sherpa.get(citizenship) ?? {};
		for (const [sherpaClass, mode] of MODE_OF_CLASS) {
			for (const country of classes[sherpaClass] ?? []) {
				offer(best, country, { mode, citizenship });
			}
		}
	}
}

/** A held visa of a country opens it, `SCHENGEN` the whole Schengen area. */
function offerByHeldVisas(best: Offers, heldVisas: readonly string[]): void {
	for (const visa of heldVisas) {
		for (const country of visa === SCHENGEN ? SCHENGEN_AREA : [visa]) {
			offer(best, country, { mode: 'held_visa', visa });
		}
	}
}

/** The exemptions' rows acting today for one of the citizenships, by their visa in the order of `EXEMPTION_VISAS`. */
function offerByExemptions(best: Offers, { citizenships, heldVisas, exemptions, today }: VisaRulesInput): void {
	const acting = actingExemptions(exemptions, today, citizenships);
	for (const visa of EXEMPTION_VISAS.filter((exemptionVisa) => heldVisas.includes(exemptionVisa))) {
		for (const row of acting.filter((candidate) => candidate.visa === visa)) {
			offer(best, row.country, { mode: row.gives === 'evisa' ? 'evisa' : 'held_visa', visa });
		}
	}
}

/** Rules 1 and 2 over the offers: the entry mode of every country and closed territory, and the closed countries. */
function reduction(best: ReadonlyMap<string, CountryAccess>, citizenships: readonly string[]): Reduction {
	const closedForEveryone = new Set(borderTable.closedForEveryone);
	const access: Record<string, CountryAccess> = {};
	const closed: string[] = [];
	for (const country of Object.keys(COUNTRIES).toSorted()) {
		let entry: CountryAccess;
		if (closedForEveryone.has(country)) {
			entry = CLOSED_FOR_EVERYONE;
		} else if (citizenships.includes(country)) {
			entry = { mode: 'visa_free', citizenship: country };
		} else {
			entry = best.get(country) ?? CLOSED;
		}
		access[country] = entry;
		if (entry.mode === 'closed') {
			closed.push(country);
		}
	}
	for (const territory of borderTable.closedTerritories) {
		access[territory.code] = CLOSED_FOR_EVERYONE;
	}
	return { access, closed };
}

/**
 * `access` with the start country open (spec «Страна точки старта»): the engine knows it, the reduction does not.
 * A country the visa rules close becomes `start`; one closed for everyone stays closed (the engine gave `no_ring`).
 */
export function withStartCountry(access: Access, startCountry: string | null): Access {
	const entry = startCountry === null ? undefined : access[startCountry];
	if (startCountry === null || entry === undefined || entry.mode !== 'closed' || entry.closedForEveryone === true) {
		return access;
	}
	return { ...access, [startCountry]: { mode: 'start' } };
}
