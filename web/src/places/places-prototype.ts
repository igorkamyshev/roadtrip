// PROTOTYPE (#148 «Места в карусели, на карточке и на карте», map #72), throwaway branch only, never to main.
//
// Places in the carousel, on the card and on the map, three variants on the real screen, switched by `?variant=a|b|c`
// before the `#` (the hash router keeps it), F by `?f=` (1, 1.25, 1.5, 2), or the bar at the bottom.
//
// What is approximate here, and how the real thing differs:
// - The places file (`/prototype/places.json`) is built from Wikidata classes by WDQS (the research's way), not from
//   OSM with `wikidata=` (ADR 0003). Places within a city's limits, populated natural places and those with P2046
//   over 2 000 km² are out, as decided.
// - A place's access point (GLOSSARY «Подъезд») is not on the road graph: the place is in the ring when its own point
//   is in the ring, or the ring's edge is within 10 km of it; it then stands at its own point, or at that nearest
//   point of the edge. The origin's places: a place within 1 km of the origin.
// - One list of points of interest by one key: a place's sitelinks × F, a city's 0.7019 · population^0.3408.
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Access } from 'worker/api';
import type { City } from '../cities/cities.ts';
import type { RingGeometry } from '../map/overlay.ts';
import type { LatLon } from '../state/point.ts';

export const VARIANTS = ['a', 'b', 'c'] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Readonly<Record<Variant, string>> = {
	a: 'A · значок типа',
	b: 'B · цвет: природа и история',
	c: 'C · картинка-эмодзи, подъезд',
};
export const F_CHOICES = [1, 1.25, 1.5, 2] as const;
const DEFAULT_F = 1.5;

const params = new URLSearchParams(window.location.search);
export const VARIANT: Variant = VARIANTS.find((variant) => variant === params.get('variant')) ?? 'a';
const fParam = Number(params.get('f'));
export const F: number = F_CHOICES.some((choice) => choice === fParam) ? fParam : DEFAULT_F;

/** Writes the variant and F before the hash and reloads: the map's layers are made once, for one variant. */
export function switchPrototype(variant: Variant, f: number): void {
	window.location.search = `?variant=${variant}&f=${f}`;
}

/** The 11 types in the order of «Типы мест на старте и отбор лучших»: the file's type index. */
export const PLACE_TYPES = [
	'park',
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

export const TYPE_NAMES: Readonly<Record<PlaceType, string>> = {
	park: 'Нацпарк',
	mountain: 'Гора',
	canyon: 'Каньон',
	waterfall: 'Водопад',
	cave: 'Пещера',
	lake: 'Озеро',
	beach: 'Пляж',
	island: 'Остров',
	monastery: 'Монастырь',
	castle: 'Замок или крепость',
	ruins: 'Руины',
};

/** Variant C: Unicode has no waterfall, cave or canyon, so those are stand-ins. */
export const TYPE_EMOJI: Readonly<Record<PlaceType, string>> = {
	park: '🌲',
	mountain: '⛰️',
	canyon: '🏜️',
	waterfall: '💦',
	cave: '🦇',
	lake: '💧',
	beach: '🏖️',
	island: '🏝️',
	monastery: '⛪',
	castle: '🏰',
	ruins: '🏛️',
};

/** Variant B: two groups by colour. */
export function groupOf(type: PlaceType): 'nature' | 'history' {
	return type === 'monastery' || type === 'castle' || type === 'ruins' ? 'history' : 'nature';
}

/** What makes a point of interest a place; a city has none. */
export interface PlaceFacts {
	readonly q: number;
	readonly type: PlaceType;
	readonly sitelinks: number;
	/** The place's own point; the City's `lat`/`lon` are its access point in this ring. */
	readonly own: LatLon;
	/** Its countries by Wikidata P17, as zones (alpha-3). */
	readonly zones: readonly string[];
	/** The zones of `zones` this ring's answer leaves open: the approximate country of its access point. */
	readonly openZones: readonly string[];
}

type PlaceRow = readonly [q: number, name: string, lat: number, lon: number, sitelinks: number, type: number, zones: string, hasRu: number];

interface Place {
	readonly q: number;
	readonly name: string;
	readonly lat: number;
	readonly lon: number;
	readonly sitelinks: number;
	readonly type: PlaceType;
	readonly zones: readonly string[];
}

async function loadPlaces(): Promise<readonly Place[]> {
	const response = await fetch('/prototype/places.json');
	if (!response.ok) {
		throw new Error(`/prototype/places.json: HTTP ${response.status}`);
	}
	const file: unknown = await response.json();
	if (!isPlacesFile(file)) {
		throw new Error('/prototype/places.json: not a places file');
	}
	return file.places.map(([q, name, lat, lon, sitelinks, type, zones]) => ({
		q,
		name,
		lat,
		lon,
		sitelinks,
		type: PLACE_TYPES[type],
		zones: zones === '' ? [] : zones.split(','),
	}));
}

function isPlacesFile(value: unknown): value is { readonly places: readonly PlaceRow[] } {
	return typeof value === 'object' && value !== null && 'places' in value && Array.isArray(value.places);
}

const placesQuery = queryOptions({
	queryKey: ['prototype-places'],
	queryFn: loadPlaces,
	staleTime: Infinity,
	gcTime: Infinity,
	retry: false,
});

export function usePlacesFile(): readonly Place[] | undefined {
	return useQuery(placesQuery).data;
}

/** The key of the one list: a city's sitelinks by the median curve of its population, a place's sitelinks × F. */
function interestOf(point: City): number {
	return point.place === undefined ? 0.7019 * point.population ** 0.3408 : point.place.sitelinks * F;
}

/** Most interesting first; places of equal sitelinks by the smaller Q-id. */
export function mostInterestingFirst(one: City, two: City): number {
	const difference = interestOf(two) - interestOf(one);
	if (difference !== 0) {
		return difference;
	}
	const byQ = (one.place?.q ?? 0) - (two.place?.q ?? 0);
	return byQ === 0 ? two.population - one.population : byQ;
}

const ACCESS_KM = 10;
const ORIGIN_PLACE_KM = 1;
const KM_PER_DEGREE = 111.32;

/** What picks the ring's places: the ring, its answer's entry modes, the origin. */
export interface PlacesAround {
	readonly ring: RingGeometry;
	readonly access: Access;
	readonly origin: LatLon;
}

/** The ring's places as points of interest, each at its approximate access point. */
export function placesInRing(places: readonly Place[], { ring, access, origin }: PlacesAround): City[] {
	const edges = ringEdges(ring);
	const found: City[] = [];
	for (const place of places) {
		const at = nearRing(edges, place) && kmBetween(place, origin) > ORIGIN_PLACE_KM ? accessPoint(edges, place) : undefined;
		if (at !== undefined) {
			found.push(asPoint(place, at, access));
		}
	}
	return found;
}

function asPoint(place: Place, at: LatLon, access: Access): City {
	const openZones = place.zones.filter((zone) => zone in access && access[zone].mode !== 'closed');
	return {
		id: -place.q,
		name: place.name,
		local: undefined,
		lat: at.lat,
		lon: at.lon,
		population: 0,
		zone: [...openZones, ...place.zones, 'NX'][0],
		place: { q: place.q, type: place.type, sitelinks: place.sitelinks, own: place, zones: place.zones, openZones },
	};
}

/** Within the ring's box widened by 10 km. */
function nearRing(edges: RingEdges, at: LatLon): boolean {
	const margin = ACCESS_KM / KM_PER_DEGREE;
	const { south, north, west, east } = edges;
	return at.lat >= south - margin && at.lat <= north + margin && at.lon >= west - margin * 3 && at.lon <= east + margin * 3;
}

/** The place itself inside the ring; else the nearest point of the ring's edge within 10 km. */
function accessPoint(edges: RingEdges, at: LatLon): LatLon | undefined {
	return contains(edges, at) ? at : nearestWithin(edges, at, ACCESS_KM);
}

function kmBetween(one: LatLon, two: LatLon): number {
	const x = (two.lon - one.lon) * Math.cos((((one.lat + two.lat) / 2) * Math.PI) / 180) * KM_PER_DEGREE;
	const y = (two.lat - one.lat) * KM_PER_DEGREE;
	return Math.hypot(x, y);
}

/** A segment of the ring's edge: lon, lat of its ends. */
type Segment = readonly [lon1: number, lat1: number, lon2: number, lat2: number];

/** The ring's edges on a grid of 0.1° cells. */
interface RingEdges {
	readonly segments: readonly Segment[];
	readonly grid: ReadonlyMap<string, readonly number[]>;
	readonly south: number;
	readonly north: number;
	readonly west: number;
	readonly east: number;
}

const CELL = 0.1;

function cellKey(x: number, y: number): string {
	return `${x},${y}`;
}

function cellOf(degrees: number): number {
	return Math.floor(degrees / CELL);
}

function ringSegments(ring: RingGeometry): Segment[] {
	return ring.coordinates.flatMap((polygon) =>
		polygon.flatMap((points) => points.slice(1).map(([lon2, lat2], index): Segment => [points[index][0], points[index][1], lon2, lat2])),
	);
}

/** The keys of the cells a segment's box covers. */
function cellsOf([lon1, lat1, lon2, lat2]: Segment): string[] {
	const keys: string[] = [];
	const [x1, x2] = [cellOf(Math.min(lon1, lon2)), cellOf(Math.max(lon1, lon2))];
	const [y1, y2] = [cellOf(Math.min(lat1, lat2)), cellOf(Math.max(lat1, lat2))];
	for (let x = x1; x <= x2; x++) {
		for (let y = y1; y <= y2; y++) {
			keys.push(cellKey(x, y));
		}
	}
	return keys;
}

function ringEdges(ring: RingGeometry): RingEdges {
	const segments = ringSegments(ring);
	const grid = new Map<string, number[]>();
	for (const [index, segment] of segments.entries()) {
		for (const key of cellsOf(segment)) {
			const cell = grid.get(key);
			if (cell === undefined) {
				grid.set(key, [index]);
			} else {
				cell.push(index);
			}
		}
	}
	// A ring has 10⁵ points and more: no spread into Math.min.
	const box = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
	for (const [lon, lat] of segments) {
		box.south = Math.min(box.south, lat);
		box.north = Math.max(box.north, lat);
		box.west = Math.min(box.west, lon);
		box.east = Math.max(box.east, lon);
	}
	return { segments, grid, ...box };
}

/** The segments in the cells of a range, each once. */
function segmentsIn(edges: RingEdges, [x1, x2]: readonly [number, number], [y1, y2]: readonly [number, number]): Set<number> {
	const found = new Set<number>();
	for (let x = x1; x <= x2; x++) {
		for (let y = y1; y <= y2; y++) {
			for (const index of edges.grid.get(cellKey(x, y)) ?? []) {
				found.add(index);
			}
		}
	}
	return found;
}

/** Inside an odd number of the ring's rings: a ray east crosses an odd number of edges in the point's row of cells. */
function contains(edges: RingEdges, { lat, lon }: LatLon): boolean {
	if (lat < edges.south || lat > edges.north || lon < edges.west || lon > edges.east) {
		return false;
	}
	let inside = false;
	for (const index of segmentsIn(edges, [cellOf(lon), cellOf(edges.east)], [cellOf(lat), cellOf(lat)])) {
		const [lon1, lat1, lon2, lat2] = edges.segments[index];
		if (lat1 > lat !== lat2 > lat && lon < lon1 + ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1)) {
			inside = !inside;
		}
	}
	return inside;
}

/** The nearest point of the ring's edge within `km`, in a flat projection around the point. */
function nearestWithin(edges: RingEdges, at: LatLon, km: number): LatLon | undefined {
	const kx = Math.cos((at.lat * Math.PI) / 180) * KM_PER_DEGREE;
	const reachX = Math.ceil(km / kx / CELL);
	const reachY = Math.ceil(km / KM_PER_DEGREE / CELL);
	const [cx, cy] = [cellOf(at.lon), cellOf(at.lat)];
	let best: LatLon | undefined;
	let bestKm = km;
	for (const index of segmentsIn(edges, [cx - reachX, cx + reachX], [cy - reachY, cy + reachY])) {
		const [px, py] = nearestOnSegment(edges.segments[index], at, kx);
		const distance = Math.hypot(px, py);
		if (distance <= bestKm) {
			bestKm = distance;
			best = { lat: at.lat + py / KM_PER_DEGREE, lon: at.lon + px / kx };
		}
	}
	return best;
}

/** The segment's point nearest to `at`, in km east and north of it. */
function nearestOnSegment([lon1, lat1, lon2, lat2]: Segment, at: LatLon, kx: number): [number, number] {
	const [ax, ay] = [(lon1 - at.lon) * kx, (lat1 - at.lat) * KM_PER_DEGREE];
	const [dx, dy] = [(lon2 - at.lon) * kx - ax, (lat2 - at.lat) * KM_PER_DEGREE - ay];
	const length = dx * dx + dy * dy;
	const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
	return [ax + t * dx, ay + t * dy];
}
