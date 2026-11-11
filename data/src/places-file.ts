// The places file (spec #154 «Сборка мест», «Формат файла мест»; spec #20 «Набор данных»): the places, points of
// interest that are no city (GLOSSARY «Место»), each with its names, point, sitelinks, type and access points.
// `build-places` writes it, the Worker serves it as a static asset at `/data/places.json`, beside the cities file, and
// the screen puts its places in the ring's list by the fame key here. Also the cells of the places' outlines and the
// rule of the origin's places (GLOSSARY «Место точки старта») they serve. Shared by the builder and the client, so no
// Node APIs here.
import { METERS_PER_DEGREE } from 'engine/geo';
import { field, items } from 'engine/json';
import { distanceKm, type Point } from './cities-file.ts';

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
	/**
	 * The Russian name: the table of Russian names of places' (data/place-russian-names.tsv, put in by the deploy), else
	 * Wikidata's Russian label, else ruwiki's title without a qualifier in brackets; empty when none has one.
	 */
	readonly ru: string;
	/** Wikidata's English label, else OSM's `name`. */
	readonly local: string;
	/** The place's own point, degrees to 0.001°: an OSM node's, or of an outline Wikidata's P625, else a point inside it. */
	readonly lat: number;
	readonly lon: number;
	/** Wikidata's sitelinks in every project of Wikimedia: the place's fame (`placeFame`). */
	readonly sitelinks: number;
	readonly type: PlaceType;
	/**
	 * At least one: the nearest to the place's point first, or of an outline's grid of access points, by its rows south
	 * to north, then its columns west to east.
	 */
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

/**
 * Where the Worker serves the cells of the places' outlines (spec #154 «Сборка мест»), as static assets: one file of
 * the outlines and the radii of the places that touch a cell of 1° × 1°, `<PLACE_OUTLINES_PATH>/<lat>_<lon>.json` by
 * its south-west corner (`placeOutlinesPath`). A cell no place touches has no file.
 */
export const PLACE_OUTLINES_PATH = '/data/place-outlines';

/** The layout of a cell's file. */
export const PLACE_OUTLINES_FORMAT = 2;

/** A place this many metres across or more is in the cells as its outline; a smaller one, as a radius (`placeRadius`). */
export const MIN_OUTLINE_METERS = 2000;

/** The origin is at a place inside it or nearer its edge than this, or nearer a place-point (GLOSSARY «Место точки старта»). */
export const ORIGIN_PLACE_METERS = 1000;

/**
 * The radius around a place's point within which the origin is at it, for a place in the cells as no outline:
 * `ORIGIN_PLACE_METERS` for a place-point, and that and half its size across (`acrossMeters`) for a small outline.
 */
export function placeRadius(acrossMeters = 0): number {
	return Math.round(ORIGIN_PLACE_METERS + acrossMeters / 2);
}

/** The cell of 1° × 1° that holds a point (degrees), by its south-west corner: `44_20`. */
export function placeOutlinesCell({ lat, lon }: Point): string {
	return `${Math.floor(lat)}_${Math.floor(lon)}`;
}

/** The file of the cell that holds a point (degrees): `/data/place-outlines/44_20.json`. */
export function placeOutlinesPath(point: Point): string {
	return `${PLACE_OUTLINES_PATH}/${placeOutlinesCell(point)}.json`;
}

/**
 * A place's outline: its rings, each flat, `[lat, lon, lat, lon, …]` in degrees to 0.001°, not closed (the last point
 * joins the first). A point is in the place when an odd number of its rings hold it, so a hole (an island in a lake)
 * is no part of it.
 */
export interface PlaceOutline {
	readonly qid: number;
	readonly rings: readonly (readonly number[])[];
}

/** A small place (a place-point, or an outline smaller than `MIN_OUTLINE_METERS` across) in a cell: its radius (`placeRadius`). */
export interface PlaceRadius {
	readonly qid: number;
	/** Around the place's point in the places file, whole metres. */
	readonly meters: number;
}

/** A cell: the places' outlines and the small places' radii that touch it. */
export interface PlaceOutlinesCell {
	readonly outlines: readonly PlaceOutline[];
	readonly radii: readonly PlaceRadius[];
}

/** An outline as a row of a cell's file: its Q-id, then its rings. */
export type PlaceOutlineRow = readonly [qid: number, ...rings: (readonly number[])[]];

/** A radius as a row of a cell's file. */
export type PlaceRadiusRow = readonly [qid: number, meters: number];

/** A cell's file: the outlines and the radii that touch it, each in order of Q-id. */
export interface PlaceOutlinesFile {
	readonly format: typeof PLACE_OUTLINES_FORMAT;
	readonly outlines: readonly PlaceOutlineRow[];
	readonly radii: readonly PlaceRadiusRow[];
}

const byQid = (one: { qid: number }, two: { qid: number }) => one.qid - two.qid;

/** The file of a cell. */
export function encodePlaceOutlines({ outlines, radii }: PlaceOutlinesCell): PlaceOutlinesFile {
	return {
		format: PLACE_OUTLINES_FORMAT,
		outlines: outlines.toSorted(byQid).map(({ qid, rings }) => outlineRow(qid, rings)),
		radii: radii.toSorted(byQid).map(({ qid, meters }) => [qid, meters]),
	};
}

/** The outlines and the radii of a cell's file. */
export function decodePlaceOutlines(file: PlaceOutlinesFile): PlaceOutlinesCell {
	return {
		outlines: file.outlines.map(([qid, ...rings]) => ({ qid, rings })),
		radii: file.radii.map(([qid, meters]) => ({ qid, meters })),
	};
}

/** A cell's file as JSON.parse gives it, checked: an error for a file of another format or an outline or a radius of other columns. */
export function parsePlaceOutlinesFile(json: unknown): PlaceOutlinesFile {
	const format = field(json, 'format');
	if (format !== PLACE_OUTLINES_FORMAT) {
		throw new Error(`The file of the outlines is of format ${String(format)}, not ${PLACE_OUTLINES_FORMAT}`);
	}
	return {
		format,
		outlines: items(field(json, 'outlines'), 'The outlines of the file of the outlines').map((row): PlaceOutlineRow => {
			const [qid, ...rings] = items(row, 'An outline of the file of the outlines');
			if (typeof qid !== 'number' || rings.length === 0 || !rings.every((ring) => isRing(ring))) {
				throw new TypeError(`An outline of the file of the outlines has other columns: ${JSON.stringify(row)}`);
			}
			return outlineRow(qid, rings);
		}),
		radii: items(field(json, 'radii'), 'The radii of the file of the outlines').map((row): PlaceRadiusRow => {
			const [qid, meters, ...rest] = items(row, 'A radius of the file of the outlines');
			if (typeof qid !== 'number' || typeof meters !== 'number' || rest.length > 0) {
				throw new TypeError(`A radius of the file of the outlines has other columns: ${JSON.stringify(row)}`);
			}
			return [qid, meters];
		}),
	};
}

function outlineRow(qid: number, rings: readonly (readonly number[])[]): PlaceOutlineRow {
	const row: [number, ...(readonly number[])[]] = [qid];
	for (const ring of rings) {
		row.push(ring);
	}
	return row;
}

/** Whether a value is a ring: three points or more, a latitude and a longitude each. */
function isRing(value: unknown): value is number[] {
	return Array.isArray(value) && value.length >= 6 && value.length % 2 === 0 && value.every((number) => typeof number === 'number');
}

/**
 * The places of the origin (GLOSSARY «Место точки старта»), by Q-id, of `places` and the origin's `cell`
 * (`placeOutlinesPath`): a place with an outline there when the origin is inside it or nearer its edge than
 * `ORIGIN_PLACE_METERS`, one with a radius there when the origin is nearer its point than that (`placeRadius`). A place
 * the cell holds neither of is far. The builder and the screen share it, so they agree.
 */
export function originPlaces(
	origin: Point,
	places: Iterable<Pick<Place, 'qid' | 'lat' | 'lon'>>,
	{ outlines, radii }: PlaceOutlinesCell,
): Set<number> {
	const found = new Set<number>();
	for (const outline of outlines) {
		if (nearOutline(outline, origin, ORIGIN_PLACE_METERS)) {
			found.add(outline.qid);
		}
	}
	const radiusOf = new Map(radii.map(({ qid, meters }) => [qid, meters]));
	for (const place of places) {
		if (distanceKm(origin, place) * 1000 < (radiusOf.get(place.qid) ?? 0)) {
			found.add(place.qid);
		}
	}
	return found;
}

/** Whether a point (degrees) is inside an outline or nearer its edge than `meters`. */
export function nearOutline(outline: Pick<PlaceOutline, 'rings'>, point: Point, meters: number): boolean {
	const metersPerLon = METERS_PER_DEGREE * Math.cos((point.lat * Math.PI) / 180);
	let inside = false;
	let nearest = Infinity;
	for (const ring of outline.rings) {
		for (let at = 0; at < ring.length; at += 2) {
			const next = (at + 2) % ring.length;
			// The edge from (x1, y1) to (x2, y2), metres east and north of the point.
			const x1 = (ring[at + 1] - point.lon) * metersPerLon;
			const y1 = (ring[at] - point.lat) * METERS_PER_DEGREE;
			const x2 = (ring[next + 1] - point.lon) * metersPerLon;
			const y2 = (ring[next] - point.lat) * METERS_PER_DEGREE;
			// The even-odd rule: whether the edge crosses the ray from the point to the east.
			if (y1 > 0 !== y2 > 0 && x1 - (y1 * (x2 - x1)) / (y2 - y1) > 0) {
				inside = !inside;
			}
			nearest = Math.min(nearest, originToSegment(x1, y1, x2, y2));
		}
	}
	return inside || nearest < meters;
}

/** The distance from (0, 0) to the segment from (x1, y1) to (x2, y2). */
// oxlint-disable-next-line eslint/max-params -- a hot path, per edge of an outline per access point of the builder: an object would be allocated per call (ADR 0002)
function originToSegment(x1: number, y1: number, x2: number, y2: number): number {
	const dx = x2 - x1;
	const dy = y2 - y1;
	const lengthSquared = dx * dx + dy * dy;
	const along = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(x1 * dx + y1 * dy) / lengthSquared));
	return Math.hypot(x1 + along * dx, y1 + along * dy);
}

/** Whether the row's tail is access points: one or more, each a latitude, a longitude and a zone. */
function isAccess(values: readonly unknown[]): values is (number | string)[] {
	return (
		values.length > 0 &&
		values.length % 3 === 0 &&
		values.every((value, index) => (index % 3 === 2 ? typeof value === 'string' : typeof value === 'number'))
	);
}
