// The zone outlines (spec «Набор данных», «Контуры зон для штриховки»): the graph's zone polygons, simplified to
// ~2 km and rounded to 0.001°, as GeoJSON for the screen, which hatches the closed countries and territories by
// `access` (#30). The Worker serves the file as a static asset.
//
// An outline is its zone as the graph's ZoneLocator sees it: each zone's rings by the even-odd rule, and a part of
// a country (a closed territory, Northern Cyprus), which wins over the country around it, cut out of that country.
// Countries that overlap in OSM overlap here too; only the parts are cut out.
import type { Graph } from 'engine/graph';
import clipping, { type MultiPolygon, type Pair, type Ring } from 'polygon-clipping';

export interface ZoneOutline {
	readonly type: 'Feature';
	readonly properties: { readonly zone: string };
	readonly geometry: { readonly type: 'MultiPolygon'; readonly coordinates: MultiPolygon };
}

/** One feature per zone, by code; [lon, lat] in degrees. */
export interface ZoneOutlines {
	readonly type: 'FeatureCollection';
	readonly features: readonly ZoneOutline[];
}

/** How far a simplified boundary may stray from the graph's, in meters. */
const OUTLINE_TOLERANCE_METERS = 2000;

/** Coordinates to 0.001° (~110 m): well within the tolerance, and short in JSON. */
const DECIMALS = 1000;

const METERS_PER_DEGREE = 111_195;

/**
 * The outlines of the graph's zones. `parts` are the zones that are parts of countries (the build report's
 * `parts`); a ring smaller than the tolerance squared after simplification, such as a small island, is left out.
 */
export function zoneOutlines(
	graph: Pick<Graph, 'zones' | 'zoneRings'>,
	parts: readonly string[],
	toleranceMeters = OUTLINE_TOLERANCE_METERS,
): ZoneOutlines {
	const regions = new Map<string, MultiPolygon>();
	for (const [code, rings] of simplifiedRings(graph, toleranceMeters)) {
		// The even-odd rule of ZoneLocator: a point is in the zone when an odd number of its rings hold it.
		const [first, ...rest] = rings.map((ring): MultiPolygon => [[ring]]);
		regions.set(code, clipping.xor(first, ...rest));
	}
	const partRegions = parts.flatMap((code) => {
		const region = regions.get(code);
		return region === undefined ? [] : [{ region, box: bbox(region) }];
	});
	const features: ZoneOutline[] = [];
	// By code, as the default sort orders strings.
	for (const [code, region] of [...regions].toSorted(([one], [two]) => (one < two ? -1 : 1))) {
		const coordinates = rounded(parts.includes(code) ? region : withoutParts(region, partRegions));
		if (coordinates.length > 0) {
			features.push({ type: 'Feature', properties: { zone: code }, geometry: { type: 'MultiPolygon', coordinates } });
		}
	}
	return { type: 'FeatureCollection', features };
}

/** Each zone's rings, simplified, without those smaller than the tolerance squared. */
function simplifiedRings(graph: Pick<Graph, 'zones' | 'zoneRings'>, toleranceMeters: number): Map<string, Ring[]> {
	const { zone, start, lat, lon } = graph.zoneRings;
	const ringsByZone = new Map<string, Ring[]>();
	for (let ring = 0; ring < zone.length; ring++) {
		const points: Pair[] = [];
		for (let point = start[ring]; point < start[ring + 1]; point++) {
			points.push([lon[point] / 1e7, lat[point] / 1e7]);
		}
		const simplified = simplifyRing(points, toleranceMeters);
		if (simplified !== undefined && areaSquareMeters(simplified) >= toleranceMeters ** 2) {
			const code = graph.zones[zone[ring]];
			ringsByZone.set(code, [...(ringsByZone.get(code) ?? []), simplified]);
		}
	}
	return ringsByZone;
}

/** A country's region with the parts of countries that overlap its box cut out, since a part wins. */
function withoutParts(region: MultiPolygon, parts: readonly { region: MultiPolygon; box: Box }[]): MultiPolygon {
	const box = bbox(region);
	const inside = parts.filter((part) => overlap(box, part.box)).map((part) => part.region);
	return inside.length > 0 ? clipping.difference(region, ...inside) : region;
}

/**
 * A closed ring simplified by Douglas–Peucker, split at its point farthest from the first; undefined when fewer
 * than three points remain.
 */
function simplifyRing(ring: readonly Pair[], tolerance: number): Ring | undefined {
	const last = ring.length - 1;
	if (last < 3) {
		return undefined;
	}
	let farthest = 0;
	let farthestMeters = -1;
	for (let point = 1; point < last; point++) {
		const meters = distanceMeters(ring[0], ring[point]);
		if (meters > farthestMeters) {
			farthestMeters = meters;
			farthest = point;
		}
	}
	const kept = keptPoints(
		ring,
		[
			[0, farthest],
			[farthest, last],
		],
		tolerance,
	);
	const simplified = ring.filter((_, point) => kept[point] === 1);
	return simplified.length >= 4 ? simplified : undefined;
}

/**
 * Douglas–Peucker on each span of the ring between two points kept, without recursion: a country's ring has
 * hundreds of thousands. The points kept are 1, the spans' ends among them; each span is simplified on its own.
 */
function keptPoints(ring: readonly Pair[], spans: readonly [number, number][], tolerance: number): Uint8Array {
	const kept = new Uint8Array(ring.length);
	const stack = [...spans];
	for (const [from, to] of spans) {
		kept[from] = 1;
		kept[to] = 1;
	}
	for (let span = stack.pop(); span !== undefined; span = stack.pop()) {
		const [from, to] = span;
		let farthest = -1;
		let farthestMeters = tolerance;
		for (let point = from + 1; point < to; point++) {
			const meters = segmentDistanceMeters(ring[point], ring[from], ring[to]);
			if (meters > farthestMeters) {
				farthestMeters = meters;
				farthest = point;
			}
		}
		if (farthest >= 0) {
			kept[farthest] = 1;
			stack.push([from, farthest], [farthest, to]);
		}
	}
	return kept;
}

/** (x, y) in meters of `point` from `origin`, east and north, on the plane tangent at `origin`'s latitude. */
function local(point: Pair, origin: Pair): [number, number] {
	return [(point[0] - origin[0]) * METERS_PER_DEGREE * Math.cos((origin[1] * Math.PI) / 180), (point[1] - origin[1]) * METERS_PER_DEGREE];
}

function distanceMeters(one: Pair, two: Pair): number {
	return Math.hypot(...local(two, one));
}

function segmentDistanceMeters(point: Pair, from: Pair, to: Pair): number {
	const [x, y] = local(point, from);
	const [dx, dy] = local(to, from);
	const lengthSquared = dx * dx + dy * dy;
	const along = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
	return Math.hypot(x - along * dx, y - along * dy);
}

/** The ring's area by the shoelace formula, on the plane tangent at its first point. */
function areaSquareMeters(ring: Ring): number {
	let twice = 0;
	for (let point = 0; point < ring.length - 1; point++) {
		const [x1, y1] = local(ring[point], ring[0]);
		const [x2, y2] = local(ring[point + 1], ring[0]);
		twice += x1 * y2 - x2 * y1;
	}
	return Math.abs(twice) / 2;
}

type Box = [west: number, south: number, east: number, north: number];

function bbox(region: MultiPolygon): Box {
	const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
	for (const polygon of region) {
		for (const [lon, lat] of polygon[0] ?? []) {
			box[0] = Math.min(box[0], lon);
			box[1] = Math.min(box[1], lat);
			box[2] = Math.max(box[2], lon);
			box[3] = Math.max(box[3], lat);
		}
	}
	return box;
}

function overlap(one: Box, two: Box): boolean {
	return one[0] <= two[2] && two[0] <= one[2] && one[1] <= two[3] && two[1] <= one[3];
}

/** The region to 0.001°, without repeated points, and without the rings (or polygons) that collapse. */
function rounded(region: MultiPolygon): MultiPolygon {
	const result: MultiPolygon = [];
	for (const polygon of region) {
		const rings: Ring[] = [];
		for (const ring of polygon) {
			const points = roundedRing(ring);
			if (points.length >= 4) {
				rings.push(points);
			} else if (rings.length === 0) {
				// The outer ring collapsed: so does the polygon.
				break;
			}
		}
		if (rings.length > 0) {
			result.push(rings);
		}
	}
	return result;
}

/** The ring to 0.001°, without a point repeated right after itself. */
function roundedRing(ring: Ring): Ring {
	const points: Ring = [];
	for (const [lon, lat] of ring) {
		const point: Pair = [Math.round(lon * DECIMALS) / DECIMALS, Math.round(lat * DECIMALS) / DECIMALS];
		const previous = points.at(-1);
		if (previous === undefined || previous[0] !== point[0] || previous[1] !== point[1]) {
			points.push(point);
		}
	}
	return points;
}
