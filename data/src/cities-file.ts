// The cities file (spec #20 «Набор данных», «Файл городов»): the cities of GeoNames from 15 000 people, each with its
// Russian and local name, place, population and zone. `build-cities` writes it, the Worker serves it as a static
// asset at `/data/cities.json`, and the screen picks the cities in the ring from it (web/src/cities/). Shared by the
// builder and the client, so no Node APIs here.
import { haversineMeters } from 'engine/geo';
import { field, items } from 'engine/json';

/** The layout of the file; a change to the columns is a new one, and the client reads only its own. */
export const CITIES_FORMAT = 1;

/** Where the Worker serves the file, as a static asset (web/public/data/ in a build). */
export const CITIES_PATH = '/data/cities.json';

/**
 * A city, as a row (in the file, `id` is the difference from the row before's: `CitiesFile`):
 *
 * - `id`: GeoNames' id (`geonameid`);
 * - `ru`: the Russian name: the table of Russian names' (data/russian-names.tsv), else GeoNames', else Wikidata's
 *   Russian label by P1566; empty when none has one. The deploy puts the table's in: the file in R2 has the others';
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
	const byId = cities.toSorted((one, two) => one[0] - two[0]);
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
	return rows.toSorted((one, two) => biggestFirst(ranked(one), ranked(two)));
}

/** A point, degrees. */
export interface Point {
	readonly lat: number;
	readonly lon: number;
}

/** A city's point and population: what its limits are made of. */
export interface Placed extends Point {
	readonly population: number;
}

/**
 * The radius of a city's limits (GLOSSARY «Пределы города»), km: 9 km × √(its people in millions), so Sarajevo's is
 * 7.5 km, Belgrade's 10, Moscow's 29. The builder leaves out the parts of a city by it, and the screen finds the
 * origin's city.
 */
export function limitsKm(population: number): number {
	return 9 * Math.sqrt(population / 1e6);
}

/** The great-circle distance between two points, km. */
export function distanceKm(one: Point, two: Point): number {
	return haversineMeters(one.lat, one.lon, two.lat, two.lon) / 1000;
}

/** A city and how far a point is from it, km. */
export interface CityAt<City> {
	readonly city: City;
	readonly km: number;
}

/**
 * The city of `cities` whose limits hold the point, the nearest of several (GLOSSARY «Город точки старта»), with
 * how far it is; undefined outside them all. Of two as close, the first in `cities`.
 */
export function cityAround<City extends Placed>(cities: Iterable<City>, at: Point): CityAt<City> | undefined {
	let around: CityAt<City> | undefined;
	for (const city of cities) {
		const km = distanceKm(at, city);
		if (km <= limitsKm(city.population) && (around === undefined || km < around.km)) {
			around = { city, km };
		}
	}
	return around;
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
