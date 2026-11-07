// The ring's contour (spec «Движок», «Кольцо»): the reached roads are painted into a raster of ~500 m cells with
// their travel times, the land near them gets a road's time plus the drive off-road to it at 30 km/h, and
// marching squares trace the cells whose time is in (N − 1, N], as Valhalla does, leaving out the cells in
// closed countries and territories. The contour is then simplified to ~500 m.
import type { Passage } from './borders.ts';
import { E7, LocalProjection } from './geo.ts';
import type { Graph } from './graph.ts';
import type { MultiPolygon } from './index.ts';
import type { Snap } from './snap.ts';
import { edgeTravelSeconds, TRAVEL_PER_DRIVING } from './traverse.ts';
import type { ZoneLocator } from './zones.ts';

const CELL_METERS = 500;
const SIMPLIFY_METERS = 500;
/**
 * Land up to this far from a reached road is in the ring when its time is; land further away is not. Tuned
 * against Valhalla with the speeds (#24, `data/valhalla-report.md`): Valhalla paints only the cells its roads
 * cross, and 1 km fits its rings best, where 3 km made the rings of 1 h a third too large.
 */
const NEAR_ROAD_METERS = 1000;
/** Off-road travel to and from a road, in seconds of travel per metre: 30 km/h of driving (spec «Привязка»). */
export const OFF_ROAD_SECONDS_PER_METER = (3.6 / 30) * TRAVEL_PER_DRIVING;
/** A raster larger than this gets coarser cells: ~120 MB of time and distance. */
const MAX_CELLS = 16_000_000;

/** What the traversal reached: the travel time to each node (Infinity when not reached), and the origin's road. */
export interface Reached {
	readonly seconds: Float64Array;
	readonly snap: Snap;
	/** Travel time from the origin to where it meets its road. */
	readonly accessSeconds: number;
	/** Travel time along the origin's road from `snap.a` to `snap.b`; undefined when it is one-way the other way. */
	readonly forwardSeconds: number | undefined;
	/** Travel time along the origin's road from `snap.b` to `snap.a`; undefined when it is one-way the other way. */
	readonly backSeconds: number | undefined;
}

export function ringContour(
	graph: Graph,
	passage: Passage,
	locator: ZoneLocator,
	reached: Reached,
	lowerSeconds: number,
	upperSeconds: number,
): MultiPolygon {
	const grid = paintRoads(graph, passage, reached, upperSeconds);
	spreadOffRoad(grid);
	const inRing = new Uint8Array(grid.time.length);
	for (let cell = 0; cell < inRing.length; cell++) {
		inRing[cell] = grid.time[cell] > lowerSeconds && grid.time[cell] <= upperSeconds ? 1 : 0;
	}
	if (passage.open.includes(0)) {
		const zones = locator.zonesOfCells(grid.minLat, grid.minLon, grid.cellLat, grid.cellLon, grid.columns, grid.rows);
		for (let cell = 0; cell < inRing.length; cell++) {
			if (!passage.open[zones[cell]]) {
				inRing[cell] = 0;
			}
		}
	}
	const rings = traceRings(inRing, grid.columns, grid.rows);
	return { type: 'MultiPolygon', coordinates: polygons(rings, grid) };
}

interface Grid {
	readonly columns: number;
	readonly rows: number;
	/** The south-west corner of cell (0, 0), in 1e-7 degrees. */
	readonly minLat: number;
	readonly minLon: number;
	/** Cell size in 1e-7 degrees. */
	readonly cellLat: number;
	readonly cellLon: number;
	readonly cellMeters: number;
	readonly projection: LocalProjection;
	/** Travel time of each cell, row by row from the south; Infinity when unreached. */
	readonly time: Float32Array;
}

function paintRoads(graph: Graph, passage: Passage, reached: Reached, upperSeconds: number): Grid {
	const { nodeLat, nodeLon, firstEdge, edgeTarget, edgeSeconds } = graph;
	const { seconds, snap } = reached;
	const originLat = nodeLat[snap.a] + snap.fraction * (nodeLat[snap.b] - nodeLat[snap.a]);
	const originLon = nodeLon[snap.a] + snap.fraction * (nodeLon[snap.b] - nodeLon[snap.a]);
	let minLat = originLat;
	let maxLat = originLat;
	let minLon = originLon;
	let maxLon = originLon;
	for (let node = 0; node < seconds.length; node++) {
		if (seconds[node] === Infinity) {
			continue;
		}
		// The node and the far ends of its edges: a road is painted up to where the time runs out.
		for (let edge = firstEdge[node] - 1; edge < firstEdge[node + 1]; edge++) {
			const end = edge < firstEdge[node] ? node : edgeTarget[edge];
			minLat = Math.min(minLat, nodeLat[end]);
			maxLat = Math.max(maxLat, nodeLat[end]);
			minLon = Math.min(minLon, nodeLon[end]);
			maxLon = Math.max(maxLon, nodeLon[end]);
		}
	}
	const projection = new LocalProjection(originLat, originLon);
	let cellMeters = CELL_METERS;
	const cellsAt = (meters: number) =>
		(((maxLat - minLat) * projection.metersPerE7Lat) / meters + 8) * (((maxLon - minLon) * projection.metersPerE7Lon) / meters + 8);
	if (cellsAt(cellMeters) > MAX_CELLS) {
		cellMeters *= Math.sqrt(cellsAt(cellMeters) / MAX_CELLS);
	}
	const cellLat = cellMeters / projection.metersPerE7Lat;
	const cellLon = cellMeters / projection.metersPerE7Lon;
	const margin = Math.ceil(NEAR_ROAD_METERS / cellMeters) + 2;
	const columns = Math.ceil((maxLon - minLon) / cellLon) + 2 * margin + 1;
	const rows = Math.ceil((maxLat - minLat) / cellLat) + 2 * margin + 1;
	const grid: Grid = {
		columns,
		rows,
		minLat: minLat - margin * cellLat,
		minLon: minLon - margin * cellLon,
		cellLat,
		cellLon,
		cellMeters,
		projection,
		time: new Float32Array(columns * rows).fill(Infinity),
	};

	const paint = (lat1: number, lon1: number, lat2: number, lon2: number, startSeconds: number, travelSeconds: number) => {
		const steps = Math.max(1, Math.ceil(2 * Math.hypot((lat2 - lat1) / cellLat, (lon2 - lon1) / cellLon)));
		for (let step = 0; step <= steps; step++) {
			const time = startSeconds + (step / steps) * travelSeconds;
			if (time > upperSeconds) {
				return;
			}
			const row = Math.floor((lat1 + (step / steps) * (lat2 - lat1) - grid.minLat) / cellLat);
			const column = Math.floor((lon1 + (step / steps) * (lon2 - lon1) - grid.minLon) / cellLon);
			const cell = row * columns + column;
			if (time < grid.time[cell]) {
				grid.time[cell] = time;
			}
		}
	};
	// The origin's road, from the point the origin meets it.
	if (reached.forwardSeconds !== undefined) {
		paint(originLat, originLon, nodeLat[snap.b], nodeLon[snap.b], reached.accessSeconds, (1 - snap.fraction) * reached.forwardSeconds);
	}
	if (reached.backSeconds !== undefined) {
		paint(originLat, originLon, nodeLat[snap.a], nodeLon[snap.a], reached.accessSeconds, snap.fraction * reached.backSeconds);
	}
	for (let node = 0; node < seconds.length; node++) {
		const start = seconds[node];
		if (start === Infinity) {
			continue;
		}
		paint(nodeLat[node], nodeLon[node], nodeLat[node], nodeLon[node], start, 0);
		for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
			const travel = edgeTravelSeconds(graph, passage, node, edge);
			if (travel === Infinity) {
				continue;
			}
			const target = edgeTarget[edge];
			const driving = edgeSeconds[edge] * TRAVEL_PER_DRIVING;
			if (travel === driving) {
				paint(nodeLat[node], nodeLon[node], nodeLat[target], nodeLon[target], start, driving);
			} else {
				// Across a border: the border delay at its middle, where the border line most likely is.
				const midLat = (nodeLat[node] + nodeLat[target]) / 2;
				const midLon = (nodeLon[node] + nodeLon[target]) / 2;
				paint(nodeLat[node], nodeLon[node], midLat, midLon, start, driving / 2);
				paint(midLat, midLon, nodeLat[target], nodeLon[target], start + travel - driving / 2, driving / 2);
			}
		}
	}
	return grid;
}

/**
 * Gives each cell within NEAR_ROAD_METERS of a painted road the time of the nearest one plus the drive off-road
 * from it: a two-pass chamfer distance transform that carries the nearest road's time along.
 */
function spreadOffRoad(grid: Grid): void {
	const { columns, rows, time } = grid;
	const roadTime = time.slice();
	const distance = new Float32Array(time.length).fill(Infinity);
	for (let cell = 0; cell < time.length; cell++) {
		if (time[cell] !== Infinity) {
			distance[cell] = 0;
		}
	}
	// Cells narrow away from the equator: a step east is shorter in metres than a step north.
	const northMeters = grid.cellMeters;
	const eastMeters = new Float64Array(rows);
	for (let row = 0; row < rows; row++) {
		const lat = (grid.minLat + (row + 0.5) * grid.cellLat) / E7;
		eastMeters[row] = grid.cellLon * grid.projection.metersPerE7Lat * Math.cos((lat * Math.PI) / 180);
	}
	const relax = (cell: number, from: number, meters: number) => {
		const fromDistance = distance[from] + meters;
		if (
			fromDistance <= NEAR_ROAD_METERS &&
			(fromDistance < distance[cell] || (fromDistance === distance[cell] && roadTime[from] < roadTime[cell]))
		) {
			distance[cell] = fromDistance;
			roadTime[cell] = roadTime[from];
		}
	};
	for (let row = 0; row < rows; row++) {
		const east = eastMeters[row];
		const diagonal = Math.hypot(east, northMeters);
		for (let column = 0; column < columns; column++) {
			const cell = row * columns + column;
			if (column > 0) {
				relax(cell, cell - 1, east);
			}
			if (row > 0) {
				relax(cell, cell - columns, northMeters);
				if (column > 0) {
					relax(cell, cell - columns - 1, diagonal);
				}
				if (column + 1 < columns) {
					relax(cell, cell - columns + 1, diagonal);
				}
			}
		}
	}
	for (let row = rows - 1; row >= 0; row--) {
		const east = eastMeters[row];
		const diagonal = Math.hypot(east, northMeters);
		for (let column = columns - 1; column >= 0; column--) {
			const cell = row * columns + column;
			if (column + 1 < columns) {
				relax(cell, cell + 1, east);
			}
			if (row + 1 < rows) {
				relax(cell, cell + columns, northMeters);
				if (column + 1 < columns) {
					relax(cell, cell + columns + 1, diagonal);
				}
				if (column > 0) {
					relax(cell, cell + columns - 1, diagonal);
				}
			}
		}
	}
	for (let cell = 0; cell < time.length; cell++) {
		time[cell] = roadTime[cell] + distance[cell] * OFF_ROAD_SECONDS_PER_METER;
	}
}

/**
 * Marching squares over the cell centres. A contour runs through the midpoints between an inside and an outside
 * centre, with the inside on its left: outer rings come out counter-clockwise, holes clockwise. Cells that touch
 * only at a corner are apart. A point is a key over doubled lattice coordinates, so midpoints are integers.
 */
function traceRings(inside: Uint8Array, columns: number, rows: number): number[][] {
	const height = 2 * rows + 5;
	const key = (x2: number, y2: number) => (x2 + 2) * height + (y2 + 2);
	const at = (column: number, row: number) => (column < 0 || row < 0 || column >= columns || row >= rows ? 0 : inside[row * columns + column]);
	const next = new Map<number, number>();
	for (let row = -1; row < rows; row++) {
		for (let column = -1; column < columns; column++) {
			const corners = at(column, row) | (at(column + 1, row) << 1) | (at(column + 1, row + 1) << 2) | (at(column, row + 1) << 3);
			if (corners === 0 || corners === 15) {
				continue;
			}
			const bottom = key(2 * column + 1, 2 * row);
			const right = key(2 * column + 2, 2 * row + 1);
			const top = key(2 * column + 1, 2 * row + 2);
			const left = key(2 * column, 2 * row + 1);
			for (const [from, to] of SEGMENTS[corners](bottom, right, top, left)) {
				next.set(from, to);
			}
		}
	}
	const rings: number[][] = [];
	for (const [start, first] of next) {
		next.delete(start);
		const ring = [Math.floor(start / height) - 2, (start % height) - 2];
		for (let point = first; point !== start; ) {
			ring.push(Math.floor(point / height) - 2, (point % height) - 2);
			const to = next.get(point)!;
			next.delete(point);
			point = to;
		}
		rings.push(ring);
	}
	return rings;
}

type Midpoints = (bottom: number, right: number, top: number, left: number) => [number, number][];

/** The segments of each marching-squares case; corner bits: 1 south-west, 2 south-east, 4 north-east, 8 north-west. */
const SEGMENTS: readonly Midpoints[] = [
	() => [],
	(b, _r, _t, l) => [[b, l]],
	(b, r) => [[r, b]],
	(_b, r, _t, l) => [[r, l]],
	(_b, r, t) => [[t, r]],
	(b, r, t, l) => [
		[b, l],
		[t, r],
	],
	(b, _r, t) => [[t, b]],
	(_b, _r, t, l) => [[t, l]],
	(_b, _r, t, l) => [[l, t]],
	(b, _r, t) => [[b, t]],
	(b, r, t, l) => [
		[r, b],
		[l, t],
	],
	(_b, r, t) => [[r, t]],
	(_b, r, _t, l) => [[l, r]],
	(b, r) => [[b, r]],
	(b, _r, _t, l) => [[l, b]],
	() => [],
];

/**
 * GeoJSON polygons of the traced rings (flat [x2, y2, …] in doubled lattice coordinates): each hole goes with the
 * smallest outer ring around it, then every ring is simplified, and one that simplifies away is dropped.
 */
function polygons(rings: number[][], grid: Grid): number[][][][] {
	const outers: { ring: number[]; area: number; box: Box; holes: number[][] }[] = [];
	const holes: number[][] = [];
	for (const ring of rings) {
		const area = signedArea(ring);
		if (area > 0) {
			outers.push({ ring, area, box: boxOf(ring), holes: [] });
		} else {
			holes.push(ring);
		}
	}
	outers.sort((one, two) => one.area - two.area);
	for (const hole of holes) {
		const [x, y] = hole;
		// The box first: a ring of the 12 h ring's thousands is the size of the whole ring.
		outers
			.find(({ box, ring }) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && contains(ring, x, y))
			?.holes.push(hole);
	}
	const tolerance = (2 * SIMPLIFY_METERS) / grid.cellMeters;
	const toLonLat = (ring: number[]) => {
		const points: number[][] = [];
		for (let index = 0; index < ring.length; index += 2) {
			const lon = (grid.minLon + (ring[index] / 2 + 0.5) * grid.cellLon) / E7;
			const lat = (grid.minLat + (ring[index + 1] / 2 + 0.5) * grid.cellLat) / E7;
			points.push([round(lon), round(lat)]);
		}
		points.push(points[0]);
		return points;
	};
	const result: number[][][][] = [];
	for (const outer of outers.reverse()) {
		const simplified = simplifyRing(outer.ring, tolerance);
		if (simplified.length < 6) {
			continue;
		}
		const polygon = [toLonLat(simplified)];
		for (const hole of outer.holes) {
			const simplifiedHole = simplifyRing(hole, tolerance);
			if (simplifiedHole.length >= 6) {
				polygon.push(toLonLat(simplifiedHole));
			}
		}
		result.push(polygon);
	}
	return result;
}

interface Box {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
}

function boxOf(ring: number[]): Box {
	let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
	for (let index = 0; index < ring.length; index += 2) {
		minX = Math.min(minX, ring[index]);
		maxX = Math.max(maxX, ring[index]);
		minY = Math.min(minY, ring[index + 1]);
		maxY = Math.max(maxY, ring[index + 1]);
	}
	return { minX, maxX, minY, maxY };
}

function round(degrees: number): number {
	return Math.round(degrees * 1e5) / 1e5;
}

/** Twice the signed area of a flat ring: positive when it runs counter-clockwise. */
function signedArea(ring: number[]): number {
	let area = 0;
	for (let index = 0; index < ring.length; index += 2) {
		const next = (index + 2) % ring.length;
		area += ring[index] * ring[next + 1] - ring[next] * ring[index + 1];
	}
	return area;
}

function contains(ring: number[], x: number, y: number): boolean {
	let inside = false;
	for (let index = 0; index < ring.length; index += 2) {
		const next = (index + 2) % ring.length;
		const [x1, y1, x2, y2] = [ring[index], ring[index + 1], ring[next], ring[next + 1]];
		if (y1 > y !== y2 > y && x < x1 + ((x2 - x1) * (y - y1)) / (y2 - y1)) {
			inside = !inside;
		}
	}
	return inside;
}

/** Douglas–Peucker on a closed flat ring: split at the point furthest from the first, simplify both halves. */
function simplifyRing(ring: number[], tolerance: number): number[] {
	const count = ring.length / 2;
	let far = 0;
	let farDistance = -1;
	for (let point = 1; point < count; point++) {
		const distance = Math.hypot(ring[2 * point] - ring[0], ring[2 * point + 1] - ring[1]);
		if (distance > farDistance) {
			far = point;
			farDistance = distance;
		}
	}
	const keep = new Uint8Array(count + 1);
	keep[0] = keep[far] = keep[count] = 1;
	const x = (point: number) => ring[2 * (point % count)];
	const y = (point: number) => ring[2 * (point % count) + 1];
	const stack = [0, far, far, count];
	while (stack.length > 0) {
		const last = stack.pop()!;
		const first = stack.pop()!;
		let worst = -1;
		let worstDistance = tolerance;
		const dx = x(last) - x(first);
		const dy = y(last) - y(first);
		const length = Math.hypot(dx, dy);
		for (let point = first + 1; point < last; point++) {
			const distance =
				length === 0
					? Math.hypot(x(point) - x(first), y(point) - y(first))
					: Math.abs(dy * (x(point) - x(first)) - dx * (y(point) - y(first))) / length;
			if (distance > worstDistance) {
				worst = point;
				worstDistance = distance;
			}
		}
		if (worst >= 0) {
			keep[worst] = 1;
			stack.push(first, worst, worst, last);
		}
	}
	const simplified: number[] = [];
	for (let point = 0; point < count; point++) {
		if (keep[point]) {
			simplified.push(x(point), y(point));
		}
	}
	return simplified;
}
