// The reduction of the visa rules (spec «Визовые правила и сведение», «Сведение»; #11): one pure function from the
// citizenships' Sherpa classes and the held visas to the entry mode of every country and where it came from. The
// client gets its result as `access`; the calculation avoids its closed countries, and the ring cache's key holds
// them instead of the citizenships and visas, so combinations that close the same countries share their rings.
import { borderTable, COUNTRIES } from 'rules';
import type { Access, CountryAccess, EntryMode } from './api.ts';
import type { SherpaClass, SherpaClasses } from './sherpa.ts';

export interface VisaRulesInput {
	/** Alpha-3, sorted. */
	readonly citizenships: readonly string[];
	/** Sherpa's classes of each citizenship. */
	readonly sherpa: ReadonlyMap<string, SherpaClasses>;
	/**
	 * The held visas: `SCHENGEN` and alpha-3 outside Schengen. Not applied yet: #31 adds them to rule 3 with the
	 * visa exemptions' table, Schengen and today's date.
	 */
	readonly heldVisas: readonly string[];
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
const MODE_OF_CLASS: Partial<Record<SherpaClass, EntryMode>> = {
	NO_VISA_REQUIRED: 'visa_free',
	VISA_ON_ARRIVAL_REQUIRED: 'visa_on_arrival',
	EVISA_OR_ETA_REQUIRED: 'evisa',
};

/** Best first (rule 3). */
const RANK: Readonly<Record<EntryMode, number>> = { visa_free: 0, start: 0, held_visa: 1, visa_on_arrival: 2, evisa: 3, closed: 4 };

const CLOSED: CountryAccess = { mode: 'closed' };
const CLOSED_FOR_EVERYONE: CountryAccess = { mode: 'closed', closedForEveryone: true };

/**
 * The entry mode of every country (rules' `COUNTRIES`) and closed territory, by the rules in order:
 *
 * 1. a country or territory closed for everyone is closed;
 * 2. a country of any of the citizenships is open without a visa;
 * 3. otherwise the best mode among the citizenships' classes (and, with #31, the held visas): without a visa, by a
 *    held visa, a visa on arrival, an e-visa, else closed. Between citizenships that give the same mode, the first.
 */
export function reduceVisaRules({ citizenships, sherpa }: VisaRulesInput): Reduction {
	const best = new Map<string, CountryAccess>();
	for (const citizenship of citizenships) {
		const classes = sherpa.get(citizenship) ?? {};
		for (const [sherpaClass, countries] of Object.entries(classes) as [SherpaClass, readonly string[]][]) {
			const mode = MODE_OF_CLASS[sherpaClass];
			if (mode === undefined) {
				continue;
			}
			for (const country of countries) {
				const current = best.get(country);
				if (current === undefined || RANK[mode] < RANK[current.mode]) {
					best.set(country, { mode, citizenship });
				}
			}
		}
	}
	// #31: the held visas and the exemptions' rows go into `best` here.
	const closedForEveryone = new Set(borderTable.closedForEveryone);
	const access: Record<string, CountryAccess> = {};
	const closed: string[] = [];
	for (const country of Object.keys(COUNTRIES).sort()) {
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
