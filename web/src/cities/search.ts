// The city search of the sheet «Откуда едем» (spec «Экран»): the cities of the cities file by the start of their
// Russian or local name, case and ё aside; up to 8, the names that start so first, bigger cities higher.
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
 * Up to 8 cities whose Russian or local name starts with `text` («Бел»: Белград), then those with a later word
 * that does («Сад»: Нови-Сад); within each, the bigger first. Nothing for a blank text, nor for a text in the
 * middle of a word.
 */
export function searchCities(cities: readonly City[], text: string): City[] {
	const wanted = searchable(text);
	if (wanted === '') {
		return [];
	}
	const word = ` ${wanted}`;
	const found: { city: City; rank: number }[] = [];
	for (const { city, names } of entriesOf(cities)) {
		if (names.some((name) => name.startsWith(wanted))) {
			found.push({ city, rank: 0 });
		} else if (names.some((name) => name.includes(word))) {
			found.push({ city, rank: 1 });
		}
	}
	return found
		.sort((one, two) => one.rank - two.rank || two.city.population - one.city.population || one.city.id - two.city.id)
		.slice(0, SEARCH_RESULTS)
		.map(({ city }) => city);
}

/**
 * A name or a text as the searches and filters compare them: lowercase, ё as е, a hyphen or a dash as a space
 * («нови сад» is «Нови-Сад»), one space between words, none around.
 */
export function searchable(text: string): string {
	return text.toLowerCase().replaceAll('ё', 'е').replaceAll(/[-‐‑–—\s]+/gu, ' ').trim();
}
