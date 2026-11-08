// The cities file (spec «Набор данных», «Файл городов»): the cities of GeoNames from 15 000 people, each with its
// Russian and local name, place, population and zone. `build-cities` writes it, the Worker serves it as a static
// asset at `/data/cities.json`, and the screen picks the cities in the ring from it (web/src/cities/). Shared by the
// builder and the client, so no Node APIs here.

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
	let previous = 0;
	const rows = [...cities]
		.sort((one, two) => one[0] - two[0])
		.map(([id, ...rest]): CityRow => {
			const row: CityRow = [id - previous, ...rest];
			previous = id;
			return row;
		});
	return { format: CITIES_FORMAT, cities: rows };
}

/** The cities of the file with their ids, biggest first: by population, then by id. */
export function decodeCities(file: CitiesFile): CityRow[] {
	let id = 0;
	return file.cities
		.map(([difference, ...rest]): CityRow => {
			id += difference;
			return [id, ...rest];
		})
		.sort((one, two) => two[5] - one[5] || one[0] - two[0]);
}
