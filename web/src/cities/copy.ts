// What a city card says besides the names (spec «Экран», «Карточка города»): the population, the entry mode's mark,
// the line on Russian plates, and the route in Google Maps.
import { EU } from 'rules/eu';
import type { CountryAccess } from 'worker/api';
import { countryName } from '../screen/countries.ts';
import { pointText, type Point } from '../state/point.ts';
import type { City } from './cities.ts';

const ONE_DECIMAL = new Intl.NumberFormat('ru', { maximumFractionDigits: 1 });

/** «1,7 млн», «1 млн», «250 тыс.»: millions to a tenth, thousands whole. */
export function populationText(population: number): string {
	// 999 600 is «1 млн», not «1000 тыс.».
	return population >= 999_500 ? `${ONE_DECIMAL.format(population / 1e6)} млн` : `${Math.round(population / 1000)} тыс.`;
}

/**
 * The mark of the entry mode: «оформить заранее» for an e-visa, «виза на границе» for a visa on arrival, «по визе
 * Шенгена» or «по визе: <страна>» for a held visa, «страна старта»; none without a visa.
 */
export function entryMark(access: CountryAccess | undefined): { readonly text: string; readonly kind: 'evisa' | 'held' | 'plain' } | undefined {
	switch (access?.mode) {
		case 'evisa':
			return { text: 'оформить заранее', kind: 'evisa' };
		case 'visa_on_arrival':
			return { text: 'виза на границе', kind: 'plain' };
		case 'held_visa':
			return { text: access.visa === 'SCHENGEN' ? 'по визе Шенгена' : `по визе: ${countryName(access.visa ?? '')}`, kind: 'held' };
		case 'start':
			return { text: 'страна старта', kind: 'plain' };
		default:
			return undefined;
	}
}

const EU_ZONES: ReadonlySet<string> = new Set(EU);

/** Whether the card says «Российские номера не пустят»: a city in the EU, and a Russian among the citizenships. */
export function platesBanned(city: City, citizenships: readonly string[]): boolean {
	return EU_ZONES.has(city.zone) && citizenships.includes('RUS');
}

/** The route from the origin to the city by car in Google Maps (https://developers.google.com/maps/documentation/urls). */
export function routeUrl(origin: Point, city: City): string {
	const query = new URLSearchParams({ api: '1', origin: pointText(origin), destination: `${city.lat},${city.lon}`, travelmode: 'driving' });
	return `https://www.google.com/maps/dir/?${query.toString()}`;
}
