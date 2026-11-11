// The places file (spec #154 «Сборка мест», «Формат файла мест»; spec #20 «Набор данных»): the places, points of
// interest that are no city (GLOSSARY «Место»), each with its names, point, sitelinks, type and access points.
// `build-places` writes it, the Worker serves it as a static asset at `/data/places.json`, beside the cities file, and
// the screen puts its places in the ring's list by the fame key here. Shared by the builder and the client, so no Node
// APIs here.
import { field, items } from 'engine/json';

/** The layout of the file; a change to the columns or to `PLACE_TYPES` is a new one, and the client reads only its own. */
export const PLACES_FORMAT = 1;

/** Where the Worker serves the file, as a static asset (web/public/data/ in a build). */
export const PLACES_PATH = '/data/places.json';

/**
 * The 11 types of places, in the order of their precedence: an object with the tags of several is of the first
 * (the tags of each: `placeTypes` in src/places.ts). A type is written in the file as its index here.
 */
export const PLACE_TYPES = [
	'national-park',
	'mountain',
	'canyon',
	'waterfall',
	'cave',
	'lake',
	'beach',
	'island',
	'monastery',
	'castle',
	'ruins',
] as const;

export type PlaceType = (typeof PLACE_TYPES)[number];

/** Nature or history: the colour of the place's card and of its diamond on the map. */
export type PlaceGroup = 'nature' | 'history';

export const PLACE_GROUP: Readonly<Record<PlaceType, PlaceGroup>> = {
	'national-park': 'nature',
	mountain: 'nature',
	canyon: 'nature',
	waterfall: 'nature',
	cave: 'nature',
	lake: 'nature',
	beach: 'nature',
	island: 'nature',
	monastery: 'history',
	castle: 'history',
	ruins: 'history',
};

/**
 * How much more a place's sitelinks weigh than the median sitelinks of a city of its fame (`cityFame`): picked in
 * #145 by the rings of the prototype, recounted by hand.
 */
export const PLACE_WEIGHT = 1.5;

/** A city's fame is the median sitelinks of a city of its population: `CITY_FAME_SCALE` · population^`CITY_FAME_EXPONENT` (#145). */
export const CITY_FAME_SCALE = 0.7019;
export const CITY_FAME_EXPONENT = 0.3408;

/**
 * The fame key of a place (GLOSSARY «Известность»): its sitelinks × `PLACE_WEIGHT`, comparable with `cityFame`, so
 * cities and places go in one list, the most famous first.
 */
export function placeFame(sitelinks: number): number {
	return sitelinks * PLACE_WEIGHT;
}

/** The fame key of a city: the median sitelinks of a city of its population (its own sitelinks play no part). */
export function cityFame(population: number): number {
	return CITY_FAME_SCALE * population ** CITY_FAME_EXPONENT;
}

/** A point on a road near a place, where a car gets to it (GLOSSARY «Подъезд»), and the zone of the road. */
export interface AccessPoint {
	/** Degrees, to 0.001°. */
	readonly lat: number;
	readonly lon: number;
	/** The zone of the road as the engine sees it (alpha-3, `RKS`, `NX`, a closed territory's code). */
	readonly zone: string;
}

/** A place, as the client reads it. */
export interface Place {
	/** Wikidata's Q-id, a number: 1029310 for Q1029310. */
	readonly qid: number;
	/** The Russian name: Wikidata's Russian label, else ruwiki's title without a qualifier in brackets; empty when none has one. */
	readonly ru: string;
	/** Wikidata's English label, else OSM's `name`. */
	readonly local: string;
	/** The place's own point, degrees to 0.001°: an OSM node's. */
	readonly lat: number;
	readonly lon: number;
	/** Wikidata's sitelinks in every project of Wikimedia: the place's fame (`placeFame`). */
	readonly sitelinks: number;
	readonly type: PlaceType;
	/** At least one, the nearest first. */
	readonly access: readonly AccessPoint[];
}

/**
 * A place as a row of the file: `[qid, ru, local, lat, lon, sitelinks, type, accessLat, accessLon, accessZone, …]`,
 * `type` the index in `PLACE_TYPES`, the access points three values each.
 */
export type PlaceRow = readonly [
	qid: number,
	ru: string,
	local: string,
	lat: number,
	lon: number,
	sitelinks: number,
	type: number,
	...access: (number | string)[],
];

/** The file: the places in order of Q-id, each row's Q-id written as its difference from the row before's, as the cities file's ids. */
export interface PlacesFile {
	readonly format: typeof PLACES_FORMAT;
	readonly places: readonly PlaceRow[];
}

/** The file of the places. */
export function encodePlaces(places: readonly Place[]): PlacesFile {
	let previous = 0;
	const rows = places
		.toSorted((one, two) => one.qid - two.qid)
		.map(({ qid, ru, local, lat, lon, sitelinks, type, access }): PlaceRow => {
			const row: [number, string, string, number, number, number, number, ...(number | string)[]] = [
				qid - previous,
				ru,
				local,
				lat,
				lon,
				sitelinks,
				PLACE_TYPES.indexOf(type),
			];
			for (const point of access) {
				row.push(point.lat, point.lon, point.zone);
			}
			previous = qid;
			return row;
		});
	return { format: PLACES_FORMAT, places: rows };
}

/** The most famous first: by sitelinks, then the smaller Q-id, as every list of places shows them. */
export function mostFamousFirst(one: Pick<Place, 'qid' | 'sitelinks'>, two: Pick<Place, 'qid' | 'sitelinks'>): number {
	return one.sitelinks === two.sitelinks ? one.qid - two.qid : two.sitelinks - one.sitelinks;
}

/** The places of the file with their Q-ids, the most famous first. */
export function decodePlaces(file: PlacesFile): Place[] {
	let qid = 0;
	const places = file.places.map(([difference, ru, local, lat, lon, sitelinks, type, ...access]): Place => {
		qid += difference;
		const points: AccessPoint[] = [];
		for (let at = 0; at < access.length; at += 3) {
			points.push({ lat: Number(access[at]), lon: Number(access[at + 1]), zone: String(access[at + 2]) });
		}
		return { qid, ru, local, lat, lon, sitelinks, type: PLACE_TYPES[type], access: points };
	});
	return places.toSorted(mostFamousFirst);
}

/** The file as JSON.parse gives it, checked: an error for a file of another format or a row of other columns. */
export function parsePlacesFile(json: unknown): PlacesFile {
	const format = field(json, 'format');
	if (format !== PLACES_FORMAT) {
		throw new Error(`The places file is of format ${String(format)}, not ${PLACES_FORMAT}`);
	}
	return { format, places: items(field(json, 'places'), 'The places file’s places').map((row) => placeRow(row)) };
}

function placeRow(json: unknown): PlaceRow {
	const [qid, ru, local, lat, lon, sitelinks, type, ...access] = items(json, 'A place of the places file');
	if (
		typeof qid !== 'number' ||
		typeof ru !== 'string' ||
		typeof local !== 'string' ||
		typeof lat !== 'number' ||
		typeof lon !== 'number' ||
		typeof sitelinks !== 'number' ||
		!isType(type) ||
		!isAccess(access)
	) {
		throw new TypeError(`A place of the places file has other columns: ${JSON.stringify(json)}`);
	}
	return [qid, ru, local, lat, lon, sitelinks, type, ...access];
}

/** Whether a value is the number of one of `PLACE_TYPES`. */
function isType(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < PLACE_TYPES.length;
}

/** Whether the row's tail is access points: one or more, each a latitude, a longitude and a zone. */
function isAccess(values: readonly unknown[]): values is (number | string)[] {
	return (
		values.length > 0 &&
		values.length % 3 === 0 &&
		values.every((value, index) => (index % 3 === 2 ? typeof value === 'string' : typeof value === 'number'))
	);
}
