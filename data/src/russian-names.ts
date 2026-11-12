// The tables of Russian names, which the deploy puts over the names of the files R2 holds, so an edit of a table goes
// live with the next deploy and needs no new dataset (data/AGENTS.md):
//
// - data/russian-names.tsv (#130): by GeoNames' id, a city's Russian name where GeoNames and Wikidata have none or a
//   broken one (`withRussianNames`); the build of the cities file only reports the cities it lacks
//   (`missingRussianNames`);
// - data/place-russian-names.tsv (#158): by Q-id, a place's Russian name, over Wikidata's label and ruwiki's title
//   (`withPlaceRussianNames`); the build of the places file reports the places it lacks.
import { join } from 'node:path';
import { type CitiesFile, type CityRow, decodeCities, encodeCities } from './cities-file.ts';
import { type PlaceRow, type PlacesFile, QID } from './places-file.ts';
import { readTable, type TableShape } from './tables.ts';

/** A name of Russian letters, digits, space, hyphen, dot, brackets and apostrophe, from a letter or a digit. */
const RUSSIAN = /^[А-Яа-яЁё0-9][А-Яа-яЁё0-9 .()'-]*$/u;

const CITIES_TABLE: TableShape = {
	shipped: join(import.meta.dirname, '../russian-names.tsv'),
	header: 'geonameid\tname\tru',
	key: /^([1-9]\d*)$/u,
	keyIs: 'a positive integer',
	value: RUSSIAN,
	badValue: 'the name is not in Russian letters',
};

const PLACES_TABLE: TableShape = {
	...CITIES_TABLE,
	shipped: join(import.meta.dirname, '../place-russian-names.tsv'),
	header: 'qid\tname\tru',
	key: QID,
	keyIs: 'Q and a positive integer',
};

/** How many of the cities `missingRussianNames` lacks it names. */
const BIGGEST_MISSING = 10;

/** The cities' table at `path`, the shipped one by default, checked: an error naming the file and the line for a bad one. */
export function readRussianNames(path = CITIES_TABLE.shipped): Map<number, string> {
	return readTable(path, CITIES_TABLE);
}

/** The places' table at `path`, the shipped one by default, by Q-id as a number, checked as `readRussianNames`. */
export function readPlaceRussianNames(path = PLACES_TABLE.shipped): Map<number, string> {
	return readTable(path, PLACES_TABLE);
}

/** The cities file with the table's names for the cities it lists, how many it named, and how many of the table's ids the file lacks. */
export function withRussianNames(
	file: CitiesFile,
	names: ReadonlyMap<number, string>,
): { file: CitiesFile; named: number; notInFile: number } {
	let named = 0;
	const cities = decodeCities(file).map((row): CityRow => {
		const [id, , local, lat, lon, population, zone] = row;
		const russian = names.get(id);
		if (russian === undefined) {
			return row;
		}
		named += 1;
		return [id, russian, local, lat, lon, population, zone];
	});
	return { file: encodeCities(cities), named, notInFile: names.size - named };
}

/**
 * The places file with the table's names for the places it lists, how many it named, and how many of the table's
 * Q-ids the file lacks. Only the rows' `ru` changes: the rows stay in their order, each with its other columns.
 */
export function withPlaceRussianNames(
	file: PlacesFile,
	names: ReadonlyMap<number, string>,
): { file: PlacesFile; named: number; notInFile: number } {
	let named = 0;
	let qid = 0;
	const places = file.places.map((row): PlaceRow => {
		const [difference, , ...rest] = row;
		qid += difference;
		const russian = names.get(qid);
		if (russian === undefined) {
			return row;
		}
		named += 1;
		return [difference, russian, ...rest];
	});
	return { file: { ...file, places }, named, notInFile: names.size - named };
}

/** The cities without a Russian name that the table lacks: how many, and the biggest of them (`BIGGEST_MISSING`). */
export interface MissingRussianNames {
	readonly count: number;
	/** Biggest first, each with GeoNames' `name`. */
	readonly biggest: readonly { readonly id: number; readonly name: string }[];
}

/**
 * Of the cities, biggest first (as `buildCities` has them), those without a Russian name that the table lacks, so
 * the deploy leaves them in their local names.
 */
export function missingRussianNames(cities: readonly CityRow[], names: ReadonlyMap<number, string>): MissingRussianNames {
	const missing = cities.filter(([id, russian]) => russian === '' && !names.has(id));
	return { count: missing.length, biggest: missing.slice(0, BIGGEST_MISSING).map(([id, , name]) => ({ id, name })) };
}
