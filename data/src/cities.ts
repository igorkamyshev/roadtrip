// The cities file (spec #20 «Набор данных», «Файл городов», #6): GeoNames' cities1000 (CC BY 4.0) from 15 000 people,
// without sections of cities (PPLX), vanished places and the parts of a city (GLOSSARY «Часть города», #45), with the
// Russian name of GeoNames or else Wikidata's (CC0), and the zone by the graph's polygons. The format is
// `cities-file.ts`.
import { METERS_PER_DEGREE } from 'engine/geo';
import { type Graph, ZoneLocator } from 'engine/graph';
import { COUNTRIES } from 'rules/countries';
import { biggestFirst, cityAround, type CityRow, limitsKm, type Placed, type Point } from './cities-file.ts';
import { type MissingRussianNames, missingRussianNames } from './russian-names.ts';
import { roundDegrees } from './degrees.ts';

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
	/** The table of Russian names (`readRussianNames`), which the deploy puts in: the file leaves it out, the report counts the cities it lacks. */
	readonly russianNames: ReadonlyMap<number, string>;
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
	/** The cities without a Russian name: the screen shows the local one, unless the table of Russian names has it. */
	readonly withoutRussian: number;
	/** The cities without a Russian name that the table of Russian names lacks: the ones to add to it. */
	readonly missingRussianNames: MissingRussianNames;
	/** The cities whose zone is the polygon they are in. */
	readonly zoneByPolygon: number;
	/** The cities outside every polygon, in their GeoNames country. */
	readonly zoneByCountry: number;
	/** The cities left out, outside every polygon and in a GeoNames country that is no zone: `<id> <name> <country>`. */
	readonly withoutZone: readonly string[];
	/** The places left out as parts of a city. */
	readonly cityParts: number;
	/** The biggest of them (`BIGGEST_PARTS`), biggest first. */
	readonly biggestCityParts: readonly CityPart[];
}

/** A place of GeoNames that is a part of a city: within the limits of a city `PART_RATIO` times as big or more. */
export interface CityPart {
	readonly id: number;
	/** GeoNames' `name`. */
	readonly name: string;
	readonly population: number;
	/** The city's GeoNames `name`: the nearest of those it is a part of. */
	readonly city: string;
	/** How far the place is from the city's point, km. */
	readonly km: number;
}

/** How many times as big as a place a city must be for the place within its limits to be a part of it. */
const PART_RATIO = 3;

/** How many of the parts of a city the report names. */
const BIGGEST_PARTS = 20;

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
	const scanned = await readPlaces(sources.cities);
	const parts = cityParts(scanned.places);
	const places = scanned.places.filter((place) => !parts.has(place.id));
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
	zoned.sort(biggestFirst);

	const geonames = await russianNames(sources.alternateNames, new Set(zoned.map((place) => place.id)));
	const wikidata = await sources.wikidataLabels(zoned.filter((place) => !geonames.has(place.id)).map((place) => place.id));
	const rows = zoned.map((place): CityRow => {
		const russian = geonames.get(place.id)?.name ?? wikidata.get(place.id) ?? '';
		return [place.id, russian, place.name, roundDegrees(place.lat), roundDegrees(place.lon), place.population, place.zone];
	});
	const withoutRussian = rows.filter(([, russian]) => russian === '').length;
	return {
		cities: rows,
		report: {
			read: scanned.read,
			cities: rows.length,
			russianFromGeoNames: geonames.size,
			russianFromWikidata: rows.length - geonames.size - withoutRussian,
			withoutRussian,
			missingRussianNames: missingRussianNames(rows, sources.russianNames),
			zoneByPolygon,
			zoneByCountry: rows.length - zoneByPolygon,
			withoutZone,
			cityParts: parts.size,
			biggestCityParts: [...parts.values()].toSorted(biggestFirst).slice(0, BIGGEST_PARTS),
		},
	};
}

/**
 * The parts of a city among the places, by id (GLOSSARY «Часть города»): a place within the limits of a city
 * `PART_RATIO` times as big or more, with the nearest such as its city. A part holds no parts: the places go biggest
 * first, so a place's bigger neighbours are known to be cities or parts before it.
 */
function cityParts(places: readonly Place[]): Map<number, CityPart> {
	const biggest = places.toSorted(biggestFirst);
	const near = limitsGrid(biggest);
	const parts = new Map<number, CityPart>();
	for (const place of biggest) {
		const bigger = near(place).filter((city) => city.population >= PART_RATIO * place.population && !parts.has(city.id));
		const around = cityAround(bigger, place);
		if (around !== undefined) {
			const { id, name, population } = place;
			parts.set(id, { id, name, population, city: around.city.name, km: Math.round(around.km * 10) / 10 });
		}
	}
	return parts;
}

/** The cells of the grid that `limitsGrid` puts the places in, degrees. */
const CELL_DEGREES = 0.5;
const LAT_CELLS = 180 / CELL_DEGREES;
const LON_CELLS = 360 / CELL_DEGREES;
/** A degree of latitude, km, on the sphere of `distanceKm`. */
const KM_PER_DEGREE = METERS_PER_DEGREE / 1000;

const latCell = (lat: number) => Math.min(LAT_CELLS - 1, Math.max(0, Math.floor((lat + 90) / CELL_DEGREES)));
const lonCell = (lon: number) => Math.floor((lon + 180) / CELL_DEGREES);
/** A cell's number; the cells of longitude go round past 180°. */
const cell = (lat: number, lon: number) => lat * LON_CELLS + (((lon % LON_CELLS) + LON_CELLS) % LON_CELLS);

/**
 * The places whose limits may hold a point: each place is put in every cell its limits touch, so a point meets only
 * those of its own cell, in the order of `places`. The world has 32 000 places, too many to measure each to each;
 * the build of the places file finds the cities around its places by it too (src/places.ts).
 */
export function limitsGrid<City extends Placed>(places: readonly City[]): (at: Point) => readonly City[] {
	const cells = new Map<number, City[]>();
	for (const place of places) {
		const km = limitsKm(place.population);
		const latDegrees = km / KM_PER_DEGREE;
		// A degree of longitude is shortest at the limits' edge farthest from the equator.
		const cos = Math.cos((Math.min(90, Math.abs(place.lat) + latDegrees) * Math.PI) / 180);
		const lonDegrees = km < KM_PER_DEGREE * cos ? km / (KM_PER_DEGREE * cos) : 180;
		const west = lonCell(place.lon - lonDegrees);
		const east = Math.min(lonCell(place.lon + lonDegrees), west + LON_CELLS - 1);
		for (let lat = latCell(place.lat - latDegrees); lat <= latCell(place.lat + latDegrees); lat++) {
			for (let lon = west; lon <= east; lon++) {
				const key = cell(lat, lon);
				const list = cells.get(key) ?? [];
				list.push(place);
				cells.set(key, list);
			}
		}
	}
	return (at) => cells.get(cell(latCell(at.lat), lonCell(at.lon))) ?? [];
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
