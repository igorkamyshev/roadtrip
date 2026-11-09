// What a city card says besides the names (spec #20 «Экран», «Карточка города»): the population, the entry mode's mark,
// the line on Russian plates, and the route in Google Maps.
import { EU } from 'rules/eu';
import { SCHENGEN } from 'rules/held-visas';
import type { CountryAccess, EntryMode } from 'worker/api';
import { visaName } from '../screen/countries.ts';
import { pointText, type LatLon } from '../state/point.ts';
import type { City } from './cities.ts';

const ONE_DECIMAL = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** «1,7 млн», «1 млн», «250 тыс.»: millions to a tenth, thousands whole. */
export function populationText(population: number): string {
	// 999 600 is «1 млн», not «1000 тыс.».
	return population >= 999_500 ? `${ONE_DECIMAL.format(population / 1e6)} млн` : `${Math.round(population / 1000)} тыс.`;
}

interface EntryMark {
	readonly text: string;
	readonly kind: 'evisa' | 'held' | 'plain';
}

/** The marks that say only the mode; a country without a visa, or closed, has none. */
const MARKS: Readonly<Partial<Record<EntryMode, EntryMark>>> = {
	evisa: { text: 'оформить заранее', kind: 'evisa' },
	visa_on_arrival: { text: 'виза на границе', kind: 'plain' },
	start: { text: 'страна старта', kind: 'plain' },
};

/**
 * The mark of the entry mode: «оформить заранее» for an e-visa, «виза на границе» for a visa on arrival, «по визе
 * Шенгена» or «по визе: <страна>» for a held visa, «страна старта»; none without a visa.
 */
export function entryMark(access: CountryAccess | undefined): EntryMark | undefined {
	if (access?.mode === 'held_visa') {
		// The visa's name as the phrase says it (#31's `visaName`): «по визе: США».
		return { text: access.visa === SCHENGEN ? 'по визе Шенгена' : `по визе: ${visaName(access.visa ?? '')}`, kind: 'held' };
	}
	return access === undefined ? undefined : MARKS[access.mode];
}

const EU_ZONES: ReadonlySet<string> = new Set(EU);

/** Whether the card says «Российские номера не пустят»: a city in the EU, and a Russian among the citizenships. */
export function platesBanned(city: City, citizenships: readonly string[]): boolean {
	return EU_ZONES.has(city.zone) && citizenships.includes('RUS');
}

/** The route from the origin to the city by car in Google Maps (https://developers.google.com/maps/documentation/urls). */
export function routeUrl(origin: LatLon, city: City): string {
	const query = new URLSearchParams({ api: '1', origin: pointText(origin), destination: `${city.lat},${city.lon}`, travelmode: 'driving' });
	return `https://www.google.com/maps/dir/?${query.toString()}`;
}
