// The cities file (spec «Набор данных», «Файл городов»): the cities of GeoNames from 15 000 people, each with its
// Russian and local name, place, population and zone. `build-cities` writes it, the Worker serves it as a static
// asset at `/data/cities.json`, and the screen picks the cities in the ring from it (web/src/cities/). Shared by the
// builder and the client, so no Node APIs here.

/** The layout of the file; a change to the columns is a new one, and the client reads only its own. */
export const CITIES_FORMAT = 1;

/** Where the Worker serves the file, as a static asset (web/public/data/ in a build). */
export const CITIES_PATH = '/data/cities.json';

/**
 * A city, as a row:
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

export interface CitiesFile {
	readonly format: typeof CITIES_FORMAT;
	/** Biggest first: by population, then by id. */
	readonly cities: readonly CityRow[];
}
