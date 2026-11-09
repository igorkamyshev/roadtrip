// The origin and how it was set (spec #20 «Экран»: the origin's label in the phrase; «Аналитика и ошибки»: `method` of
// `start set`). The link keeps only the point; how it was set lives in the screen's memory (useScreenState).
import type { City } from '../cities/cities.ts';
import { originCity } from '../cities/nearest.ts';
import type { LatLon } from '../state/point.ts';

/** How the origin was set: `method` of `start set`. */
export type StartMethod = 'geolocation' | 'search' | 'pin' | 'link' | 'saved';

/** The origin and how it was set; a city picked in the search with it. */
export type Start =
	| { readonly method: 'search'; readonly origin: LatLon; readonly city: City }
	| { readonly method: Exclude<StartMethod, 'search'>; readonly origin: LatLon };

/** The label of a point on the map: the pin's, and any origin's until the cities file comes or if it cannot. */
const ON_THE_MAP = 'на карте';

/**
 * The origin's label in the phrase: the city picked in the search, «на карте» for the pin, the origin's city
 * (GLOSSARY «Город точки старта») for geolocation, a link or the saved state, and «на карте» outside the limits of
 * every city (#45: no «около Белграда», the names are not declined); undefined without an origin («выберите»).
 */
export function startLabel(start: Start | undefined, cities: readonly City[] | undefined): string | undefined {
	if (start === undefined) {
		return undefined;
	}
	if (start.method === 'search') {
		return start.city.name;
	}
	if (start.method === 'pin') {
		return ON_THE_MAP;
	}
	return (cities === undefined ? undefined : originCity(cities, start.origin)?.name) ?? ON_THE_MAP;
}
