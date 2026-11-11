// The outlines of the places with one (spec #154 «Сборка мест», amendment «Набор данных» of spec #20): the closed
// ways and the relations with a place's tags (places.ts), read from OSM once the sitelinks have kept the famous ones,
// as their area, their size across, a point inside them and their rings, simplified, as the cells of the outlines
// hold them (`PlaceOutline` of places-file.ts); and the cells of 1° × 1° each outline, or each small place's radius,
// touches.
import { METERS_PER_DEGREE } from 'engine/geo';
import type { Pair } from 'polygon-clipping';
import type { Point } from './cities-file.ts';
import { OsmNodes, wayNodeLocator } from './osm-nodes.ts';
import type { OsmSource, OsmWay } from './osm/source.ts';
import { simplifyRing } from './outlines.ts';
import { ORIGIN_PLACE_METERS, type PlaceOutline, placeOutlinesCell, type PlaceRadius } from './places-file.ts';
import { type Chain, relationRings } from './zones.ts';
import { roundDegrees } from './degrees.ts';

/** A way of an outline, and whether it bounds a hole (its role in a relation is `inner`). */
export interface OutlineMember {
	readonly id: number;
	readonly inner: boolean;
}

/** A place's outline as the build measures it. */
export interface Outline {
	/** The outer rings' area less the holes'. */
	readonly squareMeters: number;
	/** The longer side of the outer rings' box. */
	readonly acrossMeters: number;
	/** A point inside it, degrees: the middle of its widest span on the middle line of its biggest ring's box. */
	readonly inside: Point;
	/** Its rings simplified to `OUTLINE_TOLERANCE_METERS`, as `PlaceOutline`'s: flat, to 0.001°, not closed. */
	readonly rings: readonly (readonly number[])[];
}

/** How far a simplified outline may stray from OSM's: well within the 1 km of the access points and the origin's places. */
const OUTLINE_TOLERANCE_METERS = 100;

/**
 * The outlines of `shapes`, each the ways of a closed way or a relation, in their order: a pass over the file's ways
 * for them, and over its nodes when the ways carry no locations. Undefined for a shape the file holds no whole outer
 * ring of; a ring with a way or a node it lacks is left out, as a zone's (zones.ts).
 */
export function readOutlines(osm: OsmSource, shapes: readonly (readonly OutlineMember[])[]): (Outline | undefined)[] {
	const wanted = new Set(shapes.flatMap((members) => members.map(({ id }) => id)));
	const ways = new Map<number, OsmWay>();
	const unlocated = new OsmNodes();
	osm.read({
		way(way) {
			if (wanted.has(way.id)) {
				ways.set(way.id, way);
				for (const ref of way.locations === undefined ? way.refs : []) {
					unlocated.add(ref);
				}
			}
		},
	});
	if (unlocated.lat.length > 0) {
		osm.read({
			node(node) {
				unlocated.locate(unlocated.ids.get(node.id), node.lat, node.lon);
			},
		});
	}
	const locate = wayNodeLocator(unlocated);
	return shapes.map((members) => {
		const { rings } = relationRings(members, ways, locate);
		return rings.some(({ inner }) => !inner) ? outlineOf(rings) : undefined;
	});
}

function outlineOf(chains: readonly Chain[]): Outline {
	const outer = chains.filter(({ inner }) => !inner);
	const squareMeters = chains.reduce((sum, chain) => sum + (chain.inner ? -1 : 1) * chainSquareMeters(chain), 0);
	const { south, north, west, east } = box(outer);
	const acrossMeters =
		Math.max(north - south, (east - west) * Math.cos(((south + north) / 2e7) * (Math.PI / 180))) * (METERS_PER_DEGREE / 1e7);
	const biggest = box(outer.toSorted((one, two) => chainSquareMeters(two) - chainSquareMeters(one)).slice(0, 1));
	return {
		squareMeters,
		acrossMeters,
		inside: insidePoint(chains, (biggest.south + biggest.north) / 2),
		rings: chains.map((chain) => flatRing(chain)).filter((ring) => ring.length >= 6),
	};
}

/** The box of the chains, 1e-7 degrees; a loop, not Math.min(...): an island's coast can outgrow the argument limit. */
function box(chains: readonly Chain[]): { south: number; north: number; west: number; east: number } {
	const bounds = { south: Infinity, north: -Infinity, west: Infinity, east: -Infinity };
	for (const { lat, lon } of chains) {
		for (let point = 0; point < lat.length; point++) {
			bounds.south = Math.min(bounds.south, lat[point]);
			bounds.north = Math.max(bounds.north, lat[point]);
			bounds.west = Math.min(bounds.west, lon[point]);
			bounds.east = Math.max(bounds.east, lon[point]);
		}
	}
	return bounds;
}

/** A ring's area by the shoelace formula, on the plane tangent at its first point. */
function chainSquareMeters({ lat, lon }: Chain): number {
	const metersPerLat = METERS_PER_DEGREE / 1e7;
	const metersPerLon = metersPerLat * Math.cos((lat[0] / 1e7) * (Math.PI / 180));
	let twice = 0;
	for (let point = 0; point < lat.length - 1; point++) {
		const x1 = (lon[point] - lon[0]) * metersPerLon;
		const y1 = (lat[point] - lat[0]) * metersPerLat;
		const x2 = (lon[point + 1] - lon[0]) * metersPerLon;
		const y2 = (lat[point + 1] - lat[0]) * metersPerLat;
		twice += x1 * y2 - x2 * y1;
	}
	return Math.abs(twice) / 2;
}

/**
 * A point inside the rings by the even-odd rule, on the line of latitude `lineLat` (1e-7 degrees): the middle of the
 * widest span between two of the rings' crossings of it, the first of several as wide.
 */
function insidePoint(chains: readonly Chain[], lineLat: number): Point {
	const crossings: number[] = [];
	for (const { lat, lon } of chains) {
		for (let point = 0; point < lat.length - 1; point++) {
			if (lat[point] > lineLat !== lat[point + 1] > lineLat) {
				crossings.push(lon[point] + ((lineLat - lat[point]) * (lon[point + 1] - lon[point])) / (lat[point + 1] - lat[point]));
			}
		}
	}
	crossings.sort((one, two) => one - two);
	let widest = { lon: chains[0].lon[0], width: -1 };
	for (let crossing = 0; crossing + 1 < crossings.length; crossing += 2) {
		const width = crossings[crossing + 1] - crossings[crossing];
		if (width > widest.width) {
			widest = { lon: (crossings[crossing] + crossings[crossing + 1]) / 2, width };
		}
	}
	return { lat: lineLat / 1e7, lon: widest.lon / 1e7 };
}

/** A closed ring as `PlaceOutline` holds it: simplified, `[lat, lon, …]` to 0.001°, not closed, no point twice in a row. */
function flatRing({ lat, lon }: Chain): number[] {
	const pairs = lat.map((latE7, point): Pair => [lon[point] / 1e7, latE7 / 1e7]);
	const ring: number[] = [];
	for (const [pointLon, pointLat] of (simplifyRing(pairs, OUTLINE_TOLERANCE_METERS) ?? pairs).slice(0, -1)) {
		const rounded = [roundDegrees(pointLat), roundDegrees(pointLon)];
		if (ring.at(-2) !== rounded[0] || ring.at(-1) !== rounded[1]) {
			ring.push(...rounded);
		}
	}
	if (ring.length > 2 && ring[0] === ring.at(-2) && ring[1] === ring.at(-1)) {
		ring.length -= 2;
	}
	return ring;
}

/**
 * The cells of 1° × 1° (`placeOutlinesCell`): those the outlines touch with `ORIGIN_PLACE_METERS` to spare, by the
 * boxes of their edges, and those the radii's discs around their points touch, by the discs' boxes; each cell with its
 * outlines and its radii in order of Q-id, the cells in order of their names.
 */
export function outlineCells(
	outlines: readonly PlaceOutline[],
	radii: readonly (PlaceRadius & Point)[],
): Map<string, { outlines: PlaceOutline[]; radii: PlaceRadius[] }> {
	const cells = new Map<string, { outlines: PlaceOutline[]; radii: PlaceRadius[] }>();
	const cellOf = (name: string) => {
		const cell = cells.get(name) ?? { outlines: [], radii: [] };
		cells.set(name, cell);
		return cell;
	};
	for (const outline of outlines.toSorted((one, two) => one.qid - two.qid)) {
		const touched = new Set<string>();
		for (const ring of outline.rings) {
			for (let at = 0; at < ring.length; at += 2) {
				const next = (at + 2) % ring.length;
				boxCells([ring[at], ring[next], ring[at + 1], ring[next + 1]], ORIGIN_PLACE_METERS, touched);
			}
		}
		for (const name of touched) {
			cellOf(name).outlines.push(outline);
		}
	}
	for (const { qid, meters, lat, lon } of radii.toSorted((one, two) => one.qid - two.qid)) {
		const touched = new Set<string>();
		boxCells([lat, lat, lon, lon], meters, touched);
		for (const name of touched) {
			cellOf(name).radii.push({ qid, meters });
		}
	}
	return new Map([...cells].toSorted(([one], [two]) => (one < two ? -1 : 1)));
}

/** Adds to `cells` the cells a box (two latitudes, then two longitudes) touches with `spareMeters` to spare. */
function boxCells([lat1, lat2, lon1, lon2]: readonly [number, number, number, number], spareMeters: number, cells: Set<string>): void {
	const spareLat = spareMeters / METERS_PER_DEGREE;
	const south = Math.min(lat1, lat2) - spareLat;
	const north = Math.max(lat1, lat2) + spareLat;
	// A degree of longitude is shortest at the box's edge farthest from the equator.
	const spareLon = spareLat / Math.cos(Math.min(89, Math.max(Math.abs(south), Math.abs(north))) * (Math.PI / 180));
	for (let row = Math.floor(south); row <= Math.floor(north); row++) {
		for (let column = Math.floor(Math.min(lon1, lon2) - spareLon); column <= Math.floor(Math.max(lon1, lon2) + spareLon); column++) {
			cells.add(placeOutlinesCell({ lat: row, lon: column }));
		}
	}
}
