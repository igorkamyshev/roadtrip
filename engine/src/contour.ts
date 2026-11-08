// The ring's contour (spec «Движок», «Кольцо»): the reached roads are painted into a raster of ~500 m cells with
// their travel times, the land near them gets a road's time plus the drive off-road to it at 30 km/h, and
// marching squares (trace.ts) trace the cells whose time is in (N − 1, N], as Valhalla does, leaving out the cells
// in closed countries and territories. The contour is then simplified to ~500 m.
import type { Passage } from './borders.ts';
import { type CellGrid, E7, LocalProjection } from './geo.ts';
import type { Graph } from './graph.ts';
import type { MultiPolygon } from './index.ts';
import type { OriginRoad } from './snap.ts';
import { polygons, traceRings } from './trace.ts';
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
export interface Reached extends OriginRoad {
	readonly seconds: Float64Array;
}

/** What a contour is drawn from. */
interface ContourInput {
	readonly graph: Graph;
	/** Where the traversal could go: the contour leaves out the land of closed zones. */
	readonly passage: Passage;
	readonly locator: ZoneLocator;
	readonly reached: Reached;
	/** The ring holds the land reached in (lowerSeconds, upperSeconds] of travel. */
	readonly lowerSeconds: number;
	readonly upperSeconds: number;
}

export function ringContour(input: ContourInput): MultiPolygon {
	const grid = paintRoads(input);
	spreadOffRoad(grid);
	const rings = traceRings(ringCells(input, grid), grid.columns, grid.rows);
	return { type: 'MultiPolygon', coordinates: polygons(rings, grid, (2 * SIMPLIFY_METERS) / grid.cellMeters) };
}

/** 1 for each cell of the ring: its time in (lowerSeconds, upperSeconds], and not in a closed zone. */
function ringCells({ passage, locator, lowerSeconds, upperSeconds }: ContourInput, grid: Grid): Uint8Array {
	const inRing = new Uint8Array(grid.time.length);
	for (let cell = 0; cell < inRing.length; cell++) {
		inRing[cell] = grid.time[cell] > lowerSeconds && grid.time[cell] <= upperSeconds ? 1 : 0;
	}
	if (passage.open.includes(0)) {
		const zones = locator.zonesOfCells(grid);
		for (let cell = 0; cell < inRing.length; cell++) {
			if (passage.open[zones[cell]] === 0) {
				inRing[cell] = 0;
			}
		}
	}
	return inRing;
}

interface Grid extends CellGrid {
	readonly cellMeters: number;
	readonly projection: LocalProjection;
	/** Travel time of each cell, row by row from the south; Infinity when unreached. */
	readonly time: Float32Array;
}

/** A box in 1e-7 degrees. */
interface Bounds {
	readonly minLat: number;
	readonly maxLat: number;
	readonly minLon: number;
	readonly maxLon: number;
}

/** A raster around the reached roads, each road painted into it with its travel times up to `upperSeconds`. */
function paintRoads({ graph, passage, reached, upperSeconds }: ContourInput): Grid {
	const { nodeLat, nodeLon, firstEdge, edgeTarget, edgeSeconds } = graph;
	const { seconds, snap } = reached;
	const originLat = nodeLat[snap.a] + snap.fraction * (nodeLat[snap.b] - nodeLat[snap.a]);
	const originLon = nodeLon[snap.a] + snap.fraction * (nodeLon[snap.b] - nodeLon[snap.a]);
	const bounds = reachedBounds(graph, seconds, { minLat: originLat, maxLat: originLat, minLon: originLon, maxLon: originLon });
	const grid = emptyGrid(bounds, new LocalProjection(originLat, originLon));
	const paint = painter(grid, upperSeconds);
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

/** `origin` widened to the reached nodes and the far ends of their edges: a road is painted up to where the time runs out. */
function reachedBounds(graph: Graph, seconds: Float64Array, origin: Bounds): Bounds {
	const { nodeLat, nodeLon, firstEdge, edgeTarget } = graph;
	let { minLat, maxLat, minLon, maxLon } = origin;
	for (let node = 0; node < seconds.length; node++) {
		if (seconds[node] === Infinity) {
			continue;
		}
		// The node and the far ends of its edges.
		for (let edge = firstEdge[node] - 1; edge < firstEdge[node + 1]; edge++) {
			const end = edge < firstEdge[node] ? node : edgeTarget[edge];
			minLat = Math.min(minLat, nodeLat[end]);
			maxLat = Math.max(maxLat, nodeLat[end]);
			minLon = Math.min(minLon, nodeLon[end]);
			maxLon = Math.max(maxLon, nodeLon[end]);
		}
	}
	return { minLat, maxLat, minLon, maxLon };
}

/**
 * A raster of unreached cells over the bounds and a margin past NEAR_ROAD_METERS, of CELL_METERS cells, or coarser
 * ones where that would make more than MAX_CELLS.
 */
function emptyGrid({ minLat, maxLat, minLon, maxLon }: Bounds, projection: LocalProjection): Grid {
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
	return {
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
}

/**
 * Paints a straight stretch of road into the grid: each cell it passes gets the time the road reaches it, from
 * `startSeconds` at one end to `startSeconds + travelSeconds` at the other, where that is earlier than the cell's;
 * up to `upperSeconds`.
 */
function painter(grid: Grid, upperSeconds: number) {
	const { minLat, minLon, cellLat, cellLon, columns, time } = grid;
	// oxlint-disable-next-line eslint/max-params -- a hot path, per edge of the ring: an object would be allocated per call (ADR 0002)
	return (lat1: number, lon1: number, lat2: number, lon2: number, startSeconds: number, travelSeconds: number): void => {
		const steps = Math.max(1, Math.ceil(2 * Math.hypot((lat2 - lat1) / cellLat, (lon2 - lon1) / cellLon)));
		for (let step = 0; step <= steps; step++) {
			const cellTime = startSeconds + (step / steps) * travelSeconds;
			if (cellTime > upperSeconds) {
				return;
			}
			const row = Math.floor((lat1 + (step / steps) * (lat2 - lat1) - minLat) / cellLat);
			const column = Math.floor((lon1 + (step / steps) * (lon2 - lon1) - minLon) / cellLon);
			const cell = row * columns + column;
			if (cellTime < time[cell]) {
				time[cell] = cellTime;
			}
		}
	};
}

/**
 * Gives each cell within NEAR_ROAD_METERS of a painted road the time of the nearest one plus the drive off-road
 * from it: a two-pass chamfer distance transform that carries the nearest road's time along.
 */
function spreadOffRoad(grid: Grid): void {
	const { time } = grid;
	const nearest = new NearestRoad(grid);
	for (let row = 0; row < grid.rows; row++) {
		nearest.fromSouth(row);
	}
	for (let row = grid.rows - 1; row >= 0; row--) {
		nearest.fromNorth(row);
	}
	for (let cell = 0; cell < time.length; cell++) {
		time[cell] = nearest.roadTime[cell] + nearest.distance[cell] * OFF_ROAD_SECONDS_PER_METER;
	}
}

/** The nearest painted road of each cell within NEAR_ROAD_METERS, found by passes over the grid's rows. */
class NearestRoad {
	/** The distance to the nearest painted road in metres: 0 on one, Infinity when none is near. */
	readonly distance: Float32Array;
	/** The travel time of the nearest painted road; Infinity when none is near. */
	readonly roadTime: Float32Array;
	readonly #columns: number;
	readonly #rows: number;
	readonly #northMeters: number;
	/** Cells narrow away from the equator: a step east is shorter in metres than a step north. */
	readonly #eastMeters: Float64Array;

	constructor(grid: Grid) {
		const { columns, rows, time } = grid;
		this.#columns = columns;
		this.#rows = rows;
		this.roadTime = time.slice();
		this.distance = new Float32Array(time.length).fill(Infinity);
		for (let cell = 0; cell < time.length; cell++) {
			if (time[cell] !== Infinity) {
				this.distance[cell] = 0;
			}
		}
		this.#northMeters = grid.cellMeters;
		this.#eastMeters = new Float64Array(rows);
		for (let row = 0; row < rows; row++) {
			const lat = (grid.minLat + (row + 0.5) * grid.cellLat) / E7;
			this.#eastMeters[row] = grid.cellLon * grid.projection.metersPerE7Lat * Math.cos((lat * Math.PI) / 180);
		}
	}

	/** The cells of the row, west to east, from their neighbours west, south, south-west and south-east. */
	fromSouth(row: number): void {
		const columns = this.#columns;
		const { east, north, diagonal } = this.#stepsAt(row);
		for (let column = 0; column < columns; column++) {
			const cell = row * columns + column;
			if (column > 0) {
				this.#relax(cell, cell - 1, east);
			}
			if (row > 0) {
				this.#relax(cell, cell - columns, north);
				if (column > 0) {
					this.#relax(cell, cell - columns - 1, diagonal);
				}
				if (column + 1 < columns) {
					this.#relax(cell, cell - columns + 1, diagonal);
				}
			}
		}
	}

	/** The cells of the row, east to west, from their neighbours east, north, north-east and north-west. */
	fromNorth(row: number): void {
		const columns = this.#columns;
		const { east, north, diagonal } = this.#stepsAt(row);
		for (let column = columns - 1; column >= 0; column--) {
			const cell = row * columns + column;
			if (column + 1 < columns) {
				this.#relax(cell, cell + 1, east);
			}
			if (row + 1 < this.#rows) {
				this.#relax(cell, cell + columns, north);
				if (column + 1 < columns) {
					this.#relax(cell, cell + columns + 1, diagonal);
				}
				if (column > 0) {
					this.#relax(cell, cell + columns - 1, diagonal);
				}
			}
		}
	}

	/** The metres from a cell of the row to its neighbours: east or west, north or south, and diagonally. */
	#stepsAt(row: number): { readonly east: number; readonly north: number; readonly diagonal: number } {
		const east = this.#eastMeters[row];
		const north = this.#northMeters;
		return { east, north, diagonal: Math.hypot(east, north) };
	}

	/** Takes the road of the cell `from`, `meters` away, for `cell` when it is nearer, or as near and earlier. */
	#relax(cell: number, from: number, meters: number): void {
		const { distance, roadTime } = this;
		const fromDistance = distance[from] + meters;
		if (
			fromDistance <= NEAR_ROAD_METERS &&
			(fromDistance < distance[cell] || (fromDistance === distance[cell] && roadTime[from] < roadTime[cell]))
		) {
			distance[cell] = fromDistance;
			roadTime[cell] = roadTime[from];
		}
	}
}
