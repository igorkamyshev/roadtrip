// The cities file (spec «Набор данных», «Файл городов»): the cities of GeoNames from 15 000 people, each with its
// Russian and local name, place, population and zone. `build-cities` writes it, the Worker serves it as a static
// asset at `/data/cities.json`, and the screen picks the cities in the ring from it (web/src/cities/). Shared by the
// builder and the client, so no Node APIs here.
import { field, items } from 'engine/json';

/** The layout of the file; a change to the columns is a new one, and the client reads only its own. */
export const CITIES_FORMAT = 1;

/** Where the Worker serves the file, as a static asset (web/public/data/ in a build). */
export const CITIES_PATH = '/data/cities.json';

/**
 * A city, as a row (in the file, `id` is the difference from the row before's: `CitiesFile`):
 *
 * - `id`: GeoNames' id (`geonameid`);
 * - `ru`: the Russian name, from GeoNames, else Wikidata's Russian label by P1566; empty when neither has one;
 * - `local`: GeoNames' `name`, usually the name in Latin letters («Belgrade»);
 * - `lat`, `lon`: degrees, to 0.001° (about 100 m);
 * - `population`: GeoNames' `population`;
 * - `zone`: the zone by our polygons, as the engine sees it (alpha-3, `RKS`, `NX`, or a closed territory's code),
 *   so the cities of Northern Cyprus are `NX`; for a city outside every polygon, its GeoNames country as alpha-3.
 */
export type CityRow = readonly [id: number, ru: string, local: string, lat: number, lon: number, population: number, zone: string];

/**
 * The file: the cities in order of id, each row's id written as its difference from the row before's. GeoNames'
 * ids so are short and alike, and the world's file is 0.58 MB in brotli instead of 0.69 (`decodeCities` reads it).
 */
export interface CitiesFile {
	readonly format: typeof CITIES_FORMAT;
	readonly cities: readonly CityRow[];
}

/** The file of the cities. */
export function encodeCities(cities: readonly CityRow[]): CitiesFile {
	// A copy sorted in place, here and below: the client's bundle targets ES2022 (web/vite.config.ts), without toSorted.
	const byId = [...cities];
	byId.sort((one, two) => one[0] - two[0]);
	let previous = 0;
	const rows = byId.map((row) => {
		const [id] = row;
		const encoded = withId(row, id - previous);
		previous = id;
		return encoded;
	});
	return { format: CITIES_FORMAT, cities: rows };
}

/** What puts cities in order: a city's id and population. */
export interface Ranked {
	readonly id: number;
	readonly population: number;
}

/** Biggest first: by population, then by id, as the cities file holds them and every list of cities shows them. */
export function biggestFirst(one: Ranked, two: Ranked): number {
	return one.population === two.population ? one.id - two.id : two.population - one.population;
}

/** A row's id and population. */
function ranked([id, , , , , population]: CityRow): Ranked {
	return { id, population };
}

/** The cities of the file with their ids, biggest first. */
export function decodeCities(file: CitiesFile): CityRow[] {
	let id = 0;
	const rows = file.cities.map((row) => {
		id += row[0];
		return withId(row, id);
	});
	rows.sort((one, two) => biggestFirst(ranked(one), ranked(two)));
	return rows;
}

/** The row with another first column. */
function withId([, ru, local, lat, lon, population, zone]: CityRow, id: number): CityRow {
	return [id, ru, local, lat, lon, population, zone];
}

/** The file as JSON.parse gives it, checked: an error for a file of another format or a row of other columns. */
export function parseCitiesFile(json: unknown): CitiesFile {
	const format = field(json, 'format');
	if (format !== CITIES_FORMAT) {
		throw new Error(`The cities file is of format ${String(format)}, not ${CITIES_FORMAT}`);
	}
	return { format, cities: items(field(json, 'cities'), 'The cities file’s cities').map((row) => cityRow(row)) };
}

function cityRow(json: unknown): CityRow {
	const [id, ru, local, lat, lon, population, zone] = items(json, 'A city of the cities file');
	if (
		typeof id !== 'number' ||
		typeof ru !== 'string' ||
		typeof local !== 'string' ||
		typeof lat !== 'number' ||
		typeof lon !== 'number' ||
		typeof population !== 'number' ||
		typeof zone !== 'string'
	) {
		throw new TypeError(`A city of the cities file has other columns: ${JSON.stringify(json)}`);
	}
	return [id, ru, local, lat, lon, population, zone];
}
