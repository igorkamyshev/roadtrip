// Countries by name, in Russian (spec #20 «Экран»): `Intl.DisplayNames('ru')` by the alpha-2 of rules' `COUNTRIES`, and
// our own names where it has none or not ours: Kosovo (`RKS`) and Northern Cyprus (`NX`).
import { COUNTRIES } from 'rules/countries';
import { EXEMPTION_VISAS, HELD_VISAS, SCHENGEN } from 'rules/held-visas';
import { SHERPA_PASSPORTS } from 'rules/passports';

const OWN_NAMES: Readonly<Partial<Record<string, string>>> = { RKS: 'Косово', NX: 'Северный Кипр' };

const regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });

/** The country's name in Russian; the code itself for one we do not know. */
export function countryName(code: string): string {
	// Null for a country with no alpha-2; undefined for a code that is no country.
	const alpha2: string | null | undefined = COUNTRIES[code];
	return OWN_NAMES[code] ?? (typeof alpha2 === 'string' ? regionNames.of(alpha2) : undefined) ?? code;
}

/** The citizenships in the phrase and the cards: «РФ» for the Russian one, the others by name, joined by « + ». */
export function citizenshipsLabel(citizenships: readonly string[]): string {
	return citizenships.map((code) => (code === 'RUS' ? 'РФ' : countryName(code))).join(' + ');
}

/** The default citizenship (spec #20 «При загрузке»), first in the sheet. */
export const DEFAULT_CITIZENSHIP = 'RUS';

/** By the countries' names in Russian. */
function byName(one: string, two: string): number {
	return countryName(one).localeCompare(countryName(two), 'ru');
}

/** Sherpa's passports in the sheet's order: the default first, then by name. */
export const CITIZENSHIP_CHOICES: readonly string[] = [
	DEFAULT_CITIZENSHIP,
	...SHERPA_PASSPORTS.filter((code) => code !== DEFAULT_CITIZENSHIP).toSorted(byName),
];

const VISA_NAMES: Readonly<Partial<Record<string, string>>> = { [SCHENGEN]: 'Шенген', USA: 'США' };

/** A held visa's name: «Шенген», «США», or the country's. A city's «по визе: <страна>» names it so too. */
export function visaName(code: string): string {
	return VISA_NAMES[code] ?? countryName(code);
}

const EXEMPTION_CODES: readonly string[] = EXEMPTION_VISAS;

/** Where a visa goes in the phrase: Schengen, the USA, the UK and Canada first, in this order; then the others. */
function visaRank(code: string): number {
	const index = EXEMPTION_CODES.indexOf(code);
	return index === -1 ? EXEMPTION_CODES.length : index;
}

/** Schengen, the USA, the UK and Canada first, in this order; then the others by name. */
function byVisaOrder(one: string, two: string): number {
	const byRank = visaRank(one) - visaRank(two);
	return byRank === 0 ? visaName(one).localeCompare(visaName(two), 'ru') : byRank;
}

/** The held visas in the phrase: «нет», or their names, as «Шенген, США, Грузия». */
export function visasLabel(visas: readonly string[]): string {
	return visas.length === 0
		? 'нет'
		: [...visas]
				.toSorted(byVisaOrder)
				.map((code) => visaName(code))
				.join(', ');
}

/** The sheet's «Виза одной страны»: every held visa but the four of the first section, by name. */
export const SINGLE_COUNTRY_VISAS: readonly string[] = HELD_VISAS.filter((code) => !EXEMPTION_CODES.includes(code)).toSorted(byName);
