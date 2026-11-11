// The access points of places (GLOSSARY «Подъезд»; amendment «Набор данных» of spec #20): points of the graph's roads
// where a car gets to a place. A place with a point (a peak, a waterfall, a cave) gets the nearest point of a road in
// each country within a reach (MAX_ACCESS_METERS of places.ts); one with an outline, the roads inside it and near its
// edge, one in each cell of a grid and country.
import { METERS_PER_DEGREE } from 'engine/geo';
import type { Graph } from 'engine/graph';
import type { Point } from './cities-file.ts';
import { type AccessPoint, nearOutline, type PlaceOutline } from './places-file.ts';
import { type NearRoad, RoadIndex } from './road-index.ts';
import { roundDegrees } from './degrees.ts';

/** A point of a road, degrees, and how far it is from the point asked about. */
interface RoadPoint {
	readonly lat: number;
	readonly lon: number;
	readonly meters: number;
}

/** The point of a road near a point that counts, or undefined for none: the road's nearest point, or one of its points nearest of those an outline takes. */
type PickPoint = (road: NearRoad) => RoadPoint | undefined;

/**
 * The access points of places with a point: a function of a place's point (degrees), one of `places`, giving the
 * nearest point of a road in each zone within `reach` metres, the nearest first. Only a road with both ends in one
 * zone counts, as for the origin (engine/src/snap.ts), so a point is in its road's zone.
 */
export function pointAccess(graph: Graph, places: readonly Point[], reach: number): (place: Point) => AccessPoint[] {
	const { nodeLat, nodeLon } = graph;
	const nearest = zoneNearest(graph, new RoadIndex(graph, reach, places));
	return (place) =>
		nearest(place, ({ a, b, fraction, meters }) => ({
			lat: (nodeLat[a] + fraction * (nodeLat[b] - nodeLat[a])) / 1e7,
			lon: (nodeLon[a] + fraction * (nodeLon[b] - nodeLon[a])) / 1e7,
			meters,
		}));
}

/**
 * Of the roads of `index` near a point (degrees), the point `pick` gives nearest the point in each zone, the nearest
 * first, to 0.001°. Only a road with both ends in one zone counts, as for the origin (engine/src/snap.ts), so a point is
 * in its road's zone.
 */
function zoneNearest(graph: Graph, index: RoadIndex): (point: Point, pick: PickPoint) => AccessPoint[] {
	const { nodeZone, zones } = graph;
	return (point, pick) => {
		const nearest = new Map<number, RoadPoint>();
		index.each(point.lat, point.lon, (road) => {
			const zone = nodeZone[road.a];
			// The road's nearest point is no farther than any it picks.
			if (zone === 0 || zone !== nodeZone[road.b] || road.meters >= (nearest.get(zone)?.meters ?? Infinity)) {
				return;
			}
			const picked = pick(road);
			if (picked !== undefined && picked.meters < (nearest.get(zone)?.meters ?? Infinity)) {
				nearest.set(zone, picked);
			}
		});
		return [...nearest]
			.toSorted(([zoneOne, one], [zoneTwo, two]) => (one.meters === two.meters ? zoneOne - zoneTwo : one.meters - two.meters))
			.map(([zone, { lat, lon }]) => ({ lat: roundDegrees(lat), lon: roundDegrees(lon), zone: zones[zone] }));
	};
}

/** The grid of a place's access points: one in each of its cells and zones. The lever of the places file's size. */
const ACCESS_GRID_METERS = 5000;

/** A road this near a place's outline, or inside it, gets an access point. */
const ACCESS_EDGE_METERS = 1000;

/** The grid's rows, degrees: `ACCESS_GRID_METERS` from the equator. Its columns are as wide at the middle of their row. */
const ROW_DEGREES = ACCESS_GRID_METERS / METERS_PER_DEGREE;

/** An outline's rings, as `PlaceOutline`'s. */
type Outlined = Pick<PlaceOutline, 'rings'>;

/** A cell of the grid: its bounds and middle, degrees. */
interface GridCell {
	readonly south: number;
	readonly north: number;
	readonly west: number;
	readonly east: number;
	readonly middle: Point;
}

/**
 * The access points of places with an outline: a function of a place's outline, one of `outlines`, giving in each
 * cell of the grid near it (rows south to north, then columns west to east) and each zone the point of a road nearest
 * the cell's middle of those in the cell and inside the outline or within `ACCESS_EDGE_METERS` of its edge; of several
 * zones in a cell, the nearest first. Only a road with both ends in one zone counts, as for `pointAccess`.
 */
export function outlineAccess(graph: Graph, outlines: readonly Outlined[]): (outline: Outlined) => AccessPoint[] {
	// Every road through a cell passes within half its diagonal of its middle; a little more for the columns' slant.
	const index = new RoadIndex(
		graph,
		ACCESS_GRID_METERS * 0.75,
		outlines.flatMap((outline) => gridCells(outline).map(({ middle }) => middle)),
	);
	const nearest = zoneNearest(graph, index);
	return (outline) => gridCells(outline).flatMap((cell) => nearest(cell.middle, nearestTaken(graph, cell, outline)));
}

/** Metres east and north of a cell's middle. */
interface Planar {
	readonly x: number;
	readonly y: number;
}

/** A road's segment on the plane of a cell: from `from`, `along` to its other end; its points are from + t · along, t from 0 to 1. */
interface PlanarSegment {
	readonly from: Planar;
	readonly along: Planar;
}

/** The part of a segment, by its t, from the first to the second; undefined for none. */
type Span = readonly [number, number] | undefined;

/**
 * Of a road in a cell, its point nearest the cell's middle of those in the cell and inside the outline or within
 * `ACCESS_EDGE_METERS` of its edge, on the plane tangent at the middle. If the road's point nearest the middle is not
 * one, the nearest is where the road comes within `ACCESS_EDGE_METERS` of an edge of the outline: the road gets inside
 * across an edge.
 */
function nearestTaken(graph: Graph, cell: GridCell, outline: Outlined): PickPoint {
	const { nodeLat, nodeLon } = graph;
	const metersPerLon = METERS_PER_DEGREE * Math.cos((cell.middle.lat * Math.PI) / 180);
	const planar = (lat: number, lon: number): Planar => ({
		x: (lon - cell.middle.lon) * metersPerLon,
		y: (lat - cell.middle.lat) * METERS_PER_DEGREE,
	});
	const southWest = planar(cell.south, cell.west);
	const northEast = planar(cell.north, cell.east);
	let edges: (readonly [Planar, Planar])[] | undefined;
	return ({ a, b }) => {
		const from = planar(nodeLat[a] / 1e7, nodeLon[a] / 1e7);
		const to = planar(nodeLat[b] / 1e7, nodeLon[b] / 1e7);
		const segment = { from, along: { x: to.x - from.x, y: to.y - from.y } };
		const inCell = boxSpan(segment, southWest, northEast);
		const at = (t: number): RoadPoint => {
			const x = from.x + t * segment.along.x;
			const y = from.y + t * segment.along.y;
			return { lat: cell.middle.lat + y / METERS_PER_DEGREE, lon: cell.middle.lon + x / metersPerLon, meters: Math.hypot(x, y) };
		};
		const lengthSquared = segment.along.x ** 2 + segment.along.y ** 2;
		const foot = lengthSquared === 0 ? 0 : -(from.x * segment.along.x + from.y * segment.along.y) / lengthSquared;
		if (inCell !== undefined && nearOutline(outline, at(clamp(foot, inCell)), ACCESS_EDGE_METERS)) {
			return at(clamp(foot, inCell));
		}
		edges ??= outline.rings.flatMap((ring) =>
			ring
				.filter((_, index) => index % 2 === 0)
				.map((lat, point): readonly [Planar, Planar] => {
					const next = (point * 2 + 2) % ring.length;
					return [planar(lat, ring[point * 2 + 1]), planar(ring[next], ring[next + 1])];
				}),
		);
		const near = nearestNearEdges(segment, edges, { foot, inCell });
		return near === undefined ? near : at(near);
	};
}

/**
 * Of the part of a segment `inCell`, its t nearest `foot` (the t of the segment's point nearest the middle) of those
 * within `ACCESS_EDGE_METERS` of one of `edges`; undefined for none.
 */
function nearestNearEdges(
	segment: PlanarSegment,
	edges: readonly (readonly [Planar, Planar])[],
	{ foot, inCell }: { foot: number; inCell: Span },
): number | undefined {
	let best: number | undefined;
	for (const edge of edges) {
		const near = overlap(capsuleSpan(segment, edge, ACCESS_EDGE_METERS), inCell);
		const t = near === undefined ? undefined : clamp(foot, near);
		if (t !== undefined && (best === undefined || Math.abs(t - foot) < Math.abs(best - foot))) {
			best = t;
		}
	}
	return best;
}

/** The part of a segment inside a box (its south-west and north-east corners), by Liang and Barsky. */
function boxSpan({ from, along }: PlanarSegment, southWest: Planar, northEast: Planar): Span {
	let span: Span = [0, 1];
	for (const [x0, dx, low, high] of [
		[from.x, along.x, southWest.x, northEast.x],
		[from.y, along.y, southWest.y, northEast.y],
	]) {
		span = overlap(span, linearSpan(x0, dx, [low, high]));
	}
	return span;
}

/**
 * The part of a segment within `meters` of an edge: of a disc around each end and a band along the edge, which make a
 * convex shape, so their parts make one span.
 */
function capsuleSpan(segment: PlanarSegment, [one, two]: readonly [Planar, Planar], meters: number): Span {
	const spans = [discSpan(segment, one, meters), discSpan(segment, two, meters), bandSpan(segment, [one, two], meters)].filter(
		(span) => span !== undefined,
	);
	return spans.length === 0 ? undefined : [Math.min(...spans.map(([start]) => start)), Math.max(...spans.map(([, end]) => end))];
}

/** The part of a segment's line within `meters` of a point. */
function discSpan({ from, along }: PlanarSegment, centre: Planar, meters: number): Span {
	const x = from.x - centre.x;
	const y = from.y - centre.y;
	const a = along.x ** 2 + along.y ** 2;
	const b = 2 * (along.x * x + along.y * y);
	const c = x ** 2 + y ** 2 - meters ** 2;
	if (a === 0) {
		return c <= 0 ? [-Infinity, Infinity] : undefined;
	}
	const discriminant = b ** 2 - 4 * a * c;
	return discriminant < 0 ? undefined : [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
}

/** The part of a segment's line within `meters` of an edge's line, between the lines across its ends. */
function bandSpan({ from, along }: PlanarSegment, [one, two]: readonly [Planar, Planar], meters: number): Span {
	const length = Math.hypot(two.x - one.x, two.y - one.y);
	if (length === 0) {
		return undefined;
	}
	const ux = (two.x - one.x) / length;
	const uy = (two.y - one.y) / length;
	const x = from.x - one.x;
	const y = from.y - one.y;
	return overlap(
		linearSpan(ux * x + uy * y, ux * along.x + uy * along.y, [0, length]),
		linearSpan(ux * y - uy * x, ux * along.y - uy * along.x, [-meters, meters]),
	);
}

/** The t where start + t · rate is within bounds. */
function linearSpan(start: number, rate: number, [low, high]: readonly [number, number]): Span {
	if (rate === 0) {
		return start >= low && start <= high ? [-Infinity, Infinity] : undefined;
	}
	const [one, two] = [(low - start) / rate, (high - start) / rate];
	return [Math.min(one, two), Math.max(one, two)];
}

function overlap(one: Span, two: Span): Span {
	if (one === undefined || two === undefined) {
		return undefined;
	}
	const [start, end] = [Math.max(one[0], two[0]), Math.min(one[1], two[1])];
	return start <= end ? [start, end] : undefined;
}

function clamp(t: number, [start, end]: readonly [number, number]): number {
	return Math.min(end, Math.max(start, t));
}

/** The cells of the grid within `ACCESS_EDGE_METERS` of an outline's box. */
function gridCells(outline: Outlined): GridCell[] {
	const lat = outline.rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 0));
	const lon = outline.rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 1));
	const spare = ACCESS_EDGE_METERS / METERS_PER_DEGREE;
	const cells: GridCell[] = [];
	for (let row = Math.floor((Math.min(...lat) - spare) / ROW_DEGREES); row <= Math.floor((Math.max(...lat) + spare) / ROW_DEGREES); row++) {
		const cos = Math.cos((row + 0.5) * ROW_DEGREES * (Math.PI / 180));
		const width = ROW_DEGREES / cos;
		const [first, last] = [Math.min(...lon) - spare / cos, Math.max(...lon) + spare / cos].map((edge) => Math.floor(edge / width));
		for (let column = first; column <= last; column++) {
			const [south, west] = [row * ROW_DEGREES, column * width];
			cells.push({
				south,
				north: south + ROW_DEGREES,
				west,
				east: west + width,
				middle: { lat: south + ROW_DEGREES / 2, lon: west + width / 2 },
			});
		}
	}
	return cells;
}
