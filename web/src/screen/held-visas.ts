// What each of the four visas of the exemptions' table opens, for the sheet «Мои визы» (spec #20 «Экран»): «Открывает
// весь Шенген и ещё 12 стран, например Черногорию и Сербию». Counted on the table the client bundles (rules'
// VISA_EXEMPTIONS, the same the Worker deploys with): its rows acting today for the citizenships chosen.
import { actingExemptions, SCHENGEN, VISA_EXEMPTIONS } from 'rules/held-visas';
import { plural } from './copy.ts';

/**
 * The countries the rows of `visa` open (by the visa or as an e-visa) on `today` (YYYY-MM-DD, UTC) for a person of
 * `citizenships`, each once, in the table's order. Schengen's own countries are not among them.
 */
export function opensByRows(visa: string, today: string, citizenships: readonly string[]): string[] {
	const countries = actingExemptions(VISA_EXEMPTIONS, today, citizenships)
		.filter((row) => row.visa === visa)
		.map((row) => row.country);
	return [...new Set(countries)];
}

/** Countries to name after «например», in this order, in the accusative. */
const EXAMPLES: readonly (readonly [code: string, accusative: string])[] = [
	['MNE', 'Черногорию'],
	['SRB', 'Сербию'],
	['ALB', 'Албанию'],
	['GEO', 'Грузию'],
	['MEX', 'Мексику'],
];

/**
 * The line under a visa of the first section: Schengen's names the area and up to two of the countries beyond it;
 * the others say how many countries beyond their own they open, and nothing when they open none.
 */
export function opensText(visa: string, countries: readonly string[]): string | undefined {
	const more = `ещё ${countries.length} ${plural(countries.length, ['страну', 'страны', 'стран'])}`;
	if (visa !== SCHENGEN) {
		return countries.length === 0 ? undefined : `Открывает ${more}`;
	}
	if (countries.length === 0) {
		return 'Открывает весь Шенген';
	}
	const examples = EXAMPLES.filter(([code]) => countries.includes(code))
		.slice(0, 2)
		.map(([, accusative]) => accusative);
	return `Открывает весь Шенген и ${more}${examples.length === 0 ? '' : `, например ${examples.join(' и ')}`}`;
}
