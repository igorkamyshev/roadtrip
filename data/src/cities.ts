// The cities file (spec «Набор данных», «Файл городов», #6): GeoNames' cities1000 (CC BY 4.0) from 15 000 people,
// without sections of cities (PPLX) and vanished places, with the Russian name of GeoNames or else Wikidata's
// (CC0), and the zone by the graph's polygons. The format is `cities-file.ts`.
import { type Graph, ZoneLocator } from 'engine/graph';
import { COUNTRIES } from 'rules/countries';
import type { CityRow } from './cities-file.ts';

const MIN_POPULATION = 15_000;

/**
 * GeoNames' feature codes left out (https://www.geonames.org/export/codes.html): a section of a populated place,
 * and historical, abandoned and destroyed ones.
 */
const LEFT_OUT = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW']);

export interface CitiesSources {
	/** The lines of GeoNames' `cities1000.txt` (or any file of its format). */
	readonly cities: AsyncIterable<string>;
	/** The lines of GeoNames' `alternateNamesV2.txt`, or of its files by country (`alternatenames/RS.txt`). */
	readonly alternateNames: AsyncIterable<string>;
	/** Wikidata's Russian labels by GeoNames id (P1566), asked for the cities GeoNames has no Russian name of. */
	readonly wikidataLabels: (ids: readonly number[]) => Promise<ReadonlyMap<number, string>>;
	/** The graph whose zone polygons give each city its zone. */
	readonly graph: Pick<Graph, 'zones' | 'zoneRings'>;
}

export interface CitiesReport {
	/** The lines of cities1000 read. */
	readonly read: number;
	/** The cities in the file. */
	readonly cities: number;
	/** The cities whose Russian name is GeoNames'. */
	readonly russianFromGeoNames: number;
	/** The cities whose Russian name is Wikidata's label. */
	readonly russianFromWikidata: number;
	/** The cities without a Russian name: the screen shows the local one. */
	readonly withoutRussian: number;
	/** The cities whose zone is the polygon they are in. */
	readonly zoneByPolygon: number;
	/** The cities outside every polygon, in their GeoNames country. */
	readonly zoneByCountry: number;
	/** The cities left out, outside every polygon and in a GeoNames country that is no zone: `<id> <name> <country>`. */
	readonly withoutZone: readonly string[];
}

/** A city of GeoNames as read: its line's columns that the file needs. */
interface Place {
	readonly id: number;
	readonly name: string;
	readonly lat: number;
	readonly lon: number;
	readonly population: number;
	readonly country: string;
}

/** The cities of the file (`encodeCities` writes it), biggest first, and what the build did. */
export async function buildCities(sources: CitiesSources): Promise<{ cities: CityRow[]; report: CitiesReport }> {
	const { places, read } = await readPlaces(sources.cities);
	const locator = new ZoneLocator(sources.graph.zoneRings);
	const zoned: (Place & { readonly zone: string })[] = [];
	const withoutZone: string[] = [];
	let zoneByPolygon = 0;
	for (const place of places) {
		const polygon = locator.zoneAt(Math.round(place.lat * 1e7), Math.round(place.lon * 1e7));
		const zone = polygon === 0 ? COUNTRY_ZONES.get(place.country) : sources.graph.zones[polygon];
		if (zone === undefined) {
			withoutZone.push(`${place.id} ${place.name} ${place.country}`);
			continue;
		}
		zoneByPolygon += polygon === 0 ? 0 : 1;
		zoned.push({ ...place, zone });
	}
	zoned.sort((one, two) => (one.population === two.population ? one.id - two.id : two.population - one.population));

	const geonames = await russianNames(sources.alternateNames, new Set(zoned.map((place) => place.id)));
	const wikidata = await sources.wikidataLabels(zoned.filter((place) => !geonames.has(place.id)).map((place) => place.id));
	const rows = zoned.map((place): CityRow => {
		const russian = geonames.get(place.id)?.name ?? wikidata.get(place.id) ?? '';
		return [place.id, russian, place.name, round(place.lat), round(place.lon), place.population, place.zone];
	});
	const withoutRussian = rows.filter(([, russian]) => russian === '').length;
	return {
		cities: rows,
		report: {
			read,
			cities: rows.length,
			russianFromGeoNames: geonames.size,
			russianFromWikidata: rows.length - geonames.size - withoutRussian,
			withoutRussian,
			zoneByPolygon,
			zoneByCountry: rows.length - zoneByPolygon,
			withoutZone,
		},
	};
}

/**
 * The zone of a GeoNames country (alpha-2) for a city outside every polygon: the West Bank, for one, is in no
 * country's polygon in OSM. Kosovo's XK is RKS.
 */
const COUNTRY_ZONES: ReadonlyMap<string, string> = new Map(
	Object.entries(COUNTRIES).flatMap(([zone, alpha2]) => (alpha2 === null ? [] : [[alpha2, zone] as const])),
);

/** A qualifier in brackets at the end of a name: «Шерпур (город, Бангладеш)». */
const QUALIFIER = /\s*\([^)]*\)$/u;

/** A Latin letter, as in «Грeнобль» with a Latin «e»: about 0.2 % of GeoNames' Russian names mix alphabets. */
const LATIN = /\p{Script=Latin}/u;

/** A Russian name of GeoNames and what its flags say of it. */
interface RussianName {
	readonly name: string;
	/** Without Latin letters. */
	readonly cyrillic: boolean;
	readonly preferred: boolean;
	readonly short: boolean;
	readonly colloquial: boolean;
}

/**
 * The best Russian name of GeoNames for each of `ids` (#6, «Русские названия»): of the names in Russian still in
 * use (not historic, no end date), a non-colloquial one before a colloquial one (Murmansk's own name is marked
 * colloquial), then one without Latin letters, then the preferred, then a short one, then the shortest. A qualifier
 * in brackets is dropped.
 */
async function russianNames(lines: AsyncIterable<string>, ids: ReadonlySet<number>): Promise<Map<number, RussianName>> {
	const best = new Map<number, RussianName>();
	for await (const line of lines) {
		// A quick look first: the file has some 18 M lines, a few hundred thousand of them in Russian.
		if (!line.includes('\tru\t')) {
			continue;
		}
		// alternateNameId, geonameid, isolanguage, alternate name, isPreferredName, isShortName, isColloquial,
		// isHistoric, from, to
		const columns = line.split('\t');
		const id = Number(columns[1]);
		if (columns[2] !== 'ru' || !ids.has(id) || columns[7] === '1' || (columns[9] ?? '') !== '') {
			continue;
		}
		const text = columns[3].replace(QUALIFIER, '').trim();
		const name: RussianName = {
			name: text,
			cyrillic: !LATIN.test(text),
			preferred: columns[4] === '1',
			short: columns[5] === '1',
			colloquial: columns[6] === '1',
		};
		const current = best.get(id);
		if (current === undefined || better(name, current)) {
			best.set(id, name);
		}
	}
	return best;
}

function better(one: RussianName, two: RussianName): boolean {
	if (one.colloquial !== two.colloquial) {
		return two.colloquial;
	}
	if (one.cyrillic !== two.cyrillic) {
		return one.cyrillic;
	}
	if (one.preferred !== two.preferred) {
		return one.preferred;
	}
	if (one.short !== two.short) {
		return one.short;
	}
	return one.name.length < two.name.length;
}

async function readPlaces(lines: AsyncIterable<string>): Promise<{ places: Place[]; read: number }> {
	const places: Place[] = [];
	let read = 0;
	for await (const line of lines) {
		if (line === '') {
			continue;
		}
		read++;
		// geonameid, name, asciiname, alternatenames, latitude, longitude, feature class, feature code, country code,
		// cc2, admin1–4, population, elevation, dem, timezone, modification date
		const columns = line.split('\t');
		const population = Number(columns[14]);
		if (columns[6] !== 'P' || LEFT_OUT.has(columns[7]) || !(population >= MIN_POPULATION)) {
			continue;
		}
		places.push({
			id: Number(columns[0]),
			name: columns[1],
			lat: Number(columns[4]),
			lon: Number(columns[5]),
			population,
			country: columns[8],
		});
	}
	return { places, read };
}

/** Degrees to 0.001°, about 100 m. */
function round(degrees: number): number {
	return Math.round(degrees * 1000) / 1000;
}
