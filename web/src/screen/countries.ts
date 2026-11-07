// Countries by name, in Russian (spec «Экран»): `Intl.DisplayNames('ru')` by the alpha-2 of rules' `COUNTRIES`, and
// our own names where it has none or not ours: Kosovo (`RKS`) and Northern Cyprus (`NX`).
import { COUNTRIES } from 'rules/countries';
import { SHERPA_PASSPORTS } from 'rules/passports';

const OWN_NAMES: Readonly<Record<string, string>> = { RKS: 'Косово', NX: 'Северный Кипр' };

const regionNames = new Intl.DisplayNames(['ru'], { type: 'region' });

/** The country's name in Russian; the code itself for one we do not know. */
export function countryName(code: string): string {
	const alpha2 = COUNTRIES[code];
	return OWN_NAMES[code] ?? (alpha2 ? regionNames.of(alpha2) : undefined) ?? code;
}

/** The citizenships in the phrase and the cards: «РФ» for the Russian one, the others by name, joined by « + ». */
export function citizenshipsLabel(citizenships: readonly string[]): string {
	return citizenships.map((code) => (code === 'RUS' ? 'РФ' : countryName(code))).join(' + ');
}

/** The default citizenship (spec «При загрузке»), first in the sheet. */
export const DEFAULT_CITIZENSHIP = 'RUS';

/** Sherpa's passports in the sheet's order: the default first, then by name. */
export const CITIZENSHIP_CHOICES: readonly string[] = [
	DEFAULT_CITIZENSHIP,
	...SHERPA_PASSPORTS.filter((code) => code !== DEFAULT_CITIZENSHIP).sort((one, two) => countryName(one).localeCompare(countryName(two), 'ru')),
];
