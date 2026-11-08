// The city search of the sheet «Откуда едем» (spec «Экран», #33): the cities of the cities file by the start of their
// Russian or local name, case and ё aside, a hyphen as a space; up to 8, bigger cities higher.
import type { City } from './cities.ts';

/** How many cities the search gives at most. */
export const SEARCH_RESULTS = 8;

/** A city with its names as the search compares them. */
interface Entry {
	readonly city: City;
	readonly names: readonly string[];
}

/** The names of each list of cities, made comparable once: the list of the cities file stays for the session. */
const entries = new WeakMap<readonly City[], readonly Entry[]>();

function entriesOf(cities: readonly City[]): readonly Entry[] {
	let list = entries.get(cities);
	if (list === undefined) {
		list = cities.map((city) => ({ city, names: city.local === undefined ? [searchable(city.name)] : [searchable(city.name), searchable(city.local)] }));
		entries.set(cities, list);
	}
	return list;
}

/**
 * Up to 8 cities whose Russian or local name starts with `text`, the bigger first: «Бел» is Белград, «нови с» Нови-Сад,
 * and neither «Сад» nor «град» finds anything. Every match is one from the start, as the spec's «сначала совпадения с
 * начала» wants them first: a later word of a name (Нови-Сад's «Сад») is not one. Nothing for a blank text.
 */
export function searchCities(cities: readonly City[], text: string): City[] {
	const wanted = searchable(text);
	if (wanted === '') {
		return [];
	}
	return entriesOf(cities)
		.filter(({ names }) => names.some((name) => name.startsWith(wanted)))
		.map(({ city }) => city)
		.sort((one, two) => two.population - one.population || one.id - two.id)
		.slice(0, SEARCH_RESULTS);
}

/**
 * A name or a text as the searches and filters compare them: lowercase, ё as е, a hyphen or a dash as a space
 * («нови сад» is «Нови-Сад»), one space between words, none around.
 */
export function searchable(text: string): string {
	return text.toLowerCase().replaceAll('ё', 'е').replaceAll(/[-‐‑–—\s]+/gu, ' ').trim();
}
