// The held visas (spec «Визовые правила и сведение», «Мои визы»; #11): Schengen as a whole (`SCHENGEN`) or a country
// outside it, and which rows of the visa exemptions' table act for a person today. The reduction (worker) opens the
// countries by them; the client counts what each of the four visas opens. Both import this, the client by its own
// path (`rules/held-visas`), without the border table.
import type { ExemptionVisa, VisaExemption } from './index.ts';
import { COUNTRIES } from './countries.ts';
import { SCHENGEN_AREA } from './schengen.ts';

export { VISA_EXEMPTIONS } from './visa-exemptions.ts';

/** Schengen as a held visa, in the API, the link and the events: it opens the whole area. */
export const SCHENGEN = 'SCHENGEN';

/** The visas of the exemptions' table, in the order the sheet «Мои визы» lists them. */
export const EXEMPTION_VISAS: readonly ExemptionVisa[] = ['SCHENGEN', 'USA', 'GBR', 'CAN'];

/**
 * Every visa a person may hold, sorted: `SCHENGEN`, and every country outside the Schengen area (spec «Экран»: «Виза
 * одной страны» lists all of them), by its code in `COUNTRIES`: alpha-3, `RKS`, `NX`. A Schengen country is held only
 * as Schengen.
 */
export const HELD_VISAS: readonly string[] = heldVisas();

function heldVisas(): string[] {
	return [SCHENGEN, ...Object.keys(COUNTRIES).filter((code) => !SCHENGEN_AREA.includes(code))].toSorted();
}

/**
 * The rows that act on `today` (YYYY-MM-DD, the date in UTC) for a person of `citizenships`: up to their last day
 * inclusive, and either for every citizenship or for one of these. In the table's order.
 */
export function actingExemptions(rows: readonly VisaExemption[], today: string, citizenships: readonly string[]): VisaExemption[] {
	return rows.filter(
		(row) =>
			(row.until === undefined || today <= row.until) &&
			(row.citizenships === undefined || row.citizenships.some((citizenship) => citizenships.includes(citizenship))),
	);
}

/** The date in UTC of `time` (milliseconds since the epoch), YYYY-MM-DD: what the rows' last days compare with. */
export function utcDate(time: number): string {
	return new Date(time).toISOString().slice(0, 10);
}
