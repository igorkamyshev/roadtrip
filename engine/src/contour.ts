// The ring's contour (spec #20 «Движок», «Кольцо»): the reached roads are painted into a raster of ~500 m cells with
// their travel times, the land near them gets a road's time plus the drive off-road to it at 30 km/h, and
// marching squares (trace.ts) trace the cells whose time is in (N − 1, N], as Valhalla does, with the small plots
// without roads that the roads of N h first wall in (#43), leaving out the cells in closed countries and
// territories. The contour is then simplified to ~500 m. Where the raster's cells are coarser (a ring of days, #82),
// the land near a road reaches a cell and the contour is simplified to a cell.
import type { Passage } from './borders.ts';
import { type CellGrid, E7, LocalProjection } from './geo.ts';
import type { Graph } from './graph.ts';
import type { MultiPolygon } from './index.ts';
import { fillSmallPlots, type PlotRaster } from './plots.ts';
import type { OriginRoad } from './snap.ts';
import { polygons, traceRings } from './trace.ts';
import { edgeTravelSeconds, TRAVEL_PER_DRIVING } from './traverse.ts';
import type { ZoneLocator } from './zones.ts';

const CELL_METERS = 500;
/**
 * The contour is simplified to this, or to a cell where the raster's cells are coarser (MAX_CELLS): a smaller
 * tolerance keeps every step of the cells' staircase (#82).
 */
const SIMPLIFY_METERS = 500;
/**
 * Land up to this far from a reached road is in the ring when its time is; land further away is not. Tuned
 * against Valhalla with the speeds (#24, `data/valhalla-report.md`): Valhalla paints only the cells its roads
 * cross, and 1 km fits its rings best, where 3 km made the rings of 1 h a third too large.
 */
const NEAR_ROAD_METERS = 1000;
/**
 * The land near a road on the raster: NEAR_ROAD_METERS, or a cell where the cells are coarser. With less than a cell,
 * the cells a road crosses diagonally touch only at their corners, and its ring falls apart into a polygon a cell:
 * a ring of days from Istanbul came to 16 000 polygons and 5.2 MB of JSON (#82).
 */
function nearRoadMeters(cellMeters: number): number {
	return Math.max(NEAR_ROAD_METERS, cellMeters);
}
/**
 * A plot of land further than NEAR_ROAD_METERS from every road, which the roads reached within N h wall in on every
 * side, is in a ring up to 12 h when it is smaller than this (past 12 h see SMALL_PLOT_GROWTH): land between the roads, not a mountain range, a steppe inside
 * a loop of roads or a large lake (#43). Without it the ring is lace, a hole between every two roads 2 km apart.
 * The area is the plot's own, beyond NEAR_ROAD_METERS: 200 km² is a loop of roads ~16 km across. Picked by looking
 * at the rings of 3 and 6 h from Vienna, Prague, Madrid, Oslo and Östersund drawn with each threshold: at 100 km²
 * the farmland between the roads of Castile and Värmland stayed in holes, at 400 km² the Montes de Toledo and the
 * mountains of Slovakia went in the ring.
 */
const SMALL_PLOT_SQUARE_METERS = 200_000_000;
/**
 * Past 12 h a ring is seen whole on a smaller scale, and in a sparse network of roads (Russia, Scandinavia) they are
 * 30–80 km apart: with plots of 200 km² a ring of days is lace (#77). So past 12 h the small plot grows with the
 * square of the ring's upper bound, SMALL_PLOT_GROWTH × (upper / 12 h)² times SMALL_PLOT_SQUARE_METERS: 3 200 km² up
 * to 24 h, 20 000 km² up to 60 h, a square of 140 km. Picked by the rings of days of the world drawn with growths 1, 4
 * and 9 (docs/container-bench.md, «Кружево колец дней»): at 1 the networks of Russia and Iran stayed lace, at 4 they
 * were land, and 9 closed only a few holes more with plots of up to 45 000 km², the size of a large lake.
 */
const SMALL_PLOT_FROM_SECONDS = 12 * 3600;
const SMALL_PLOT_GROWTH = 4;
/** Off-road travel to and from a road, in seconds of travel per metre: 30 km/h of driving (spec #20 «Привязка»). */
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
	/**
	 * The ring holds the land reached in (lowerSeconds, upperSeconds] of travel, and the small plots without roads
	 * that the roads reached within upperSeconds wall in but those reached within lowerSeconds do not.
	 */
	readonly lowerSeconds: number;
	readonly upperSeconds: number;
}

export function ringContour(input: ContourInput): MultiPolygon {
	const grid = paintRoads(input);
	spreadOffRoad(grid);
	const rings = traceRings(ringCells(input, grid), grid.columns, grid.rows);
	const simplifyMeters = Math.max(SIMPLIFY_METERS, grid.cellMeters);
	return { type: 'MultiPolygon', coordinates: polygons(rings, grid, (2 * simplifyMeters) / grid.cellMeters) };
}

/**
 * 1 for each cell of the ring: reached or walled in within upperSeconds but not within lowerSeconds, and not in a
 * closed zone. A plot walled in within lowerSeconds is walled in within upperSeconds too, so rings N − 1 and N
 * meet without a gap or an overlap.
 */
function ringCells({ passage, locator, lowerSeconds, upperSeconds }: ContourInput, grid: Grid): Uint8Array {
	const raster: PlotRaster = {
		columns: grid.columns,
		rows: grid.rows,
		rowCellSquareMeters: eastMetersOfRows(grid).map((east) => east * grid.cellMeters),
	};
	const plot = smallPlotSquareMeters(upperSeconds);
	const inRing = reachedWithin(grid, { raster, plot }, upperSeconds);
	const reachedSooner = reachedWithin(grid, { raster, plot }, lowerSeconds);
	for (let cell = 0; cell < inRing.length; cell++) {
		inRing[cell] &= reachedSooner[cell] ^ 1;
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

/**
 * The small plot of a ring up to `upperSeconds`, in m². One for both of its bounds, so that a plot walled in within
 * the lower bound is walled in within the upper one too, and the ring holds no part of it.
 */
function smallPlotSquareMeters(upperSeconds: number): number {
	return upperSeconds <= SMALL_PLOT_FROM_SECONDS
		? SMALL_PLOT_SQUARE_METERS
		: SMALL_PLOT_SQUARE_METERS * SMALL_PLOT_GROWTH * (upperSeconds / SMALL_PLOT_FROM_SECONDS) ** 2;
}

/**
 * 1 for each cell reached within `seconds`, and for each cell of a plot smaller than `plot` m² that the cells
 * reached within it wall in.
 */
function reachedWithin(grid: Grid, { raster, plot }: { readonly raster: PlotRaster; readonly plot: number }, seconds: number): Uint8Array {
	const reached = new Uint8Array(grid.time.length);
	for (let cell = 0; cell < reached.length; cell++) {
		reached[cell] = grid.time[cell] <= seconds ? 1 : 0;
	}
	fillSmallPlots(reached, raster, plot);
	return reached;
}

/** The metres east to west of a cell of each row: cells narrow away from the equator. */
function eastMetersOfRows(grid: Grid): Float64Array {
	const eastMeters = new Float64Array(grid.rows);
	for (let row = 0; row < grid.rows; row++) {
		const lat = (grid.minLat + (row + 0.5) * grid.cellLat) / E7;
		eastMeters[row] = grid.cellLon * grid.projection.metersPerE7Lat * Math.cos((lat * Math.PI) / 180);
	}
	return eastMeters;
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
 * A raster of unreached cells over the bounds and a margin past the land near a road, of CELL_METERS cells, or coarser
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
	const margin = Math.ceil(nearRoadMeters(cellMeters) / cellMeters) + 2;
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
 * Gives each cell near a painted road (nearRoadMeters) the time of the nearest one plus the drive off-road
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

/** The nearest painted road of each cell near one (nearRoadMeters), found by passes over the grid's rows. */
class NearestRoad {
	/** The distance to the nearest painted road in metres: 0 on one, Infinity when none is near. */
	readonly distance: Float32Array;
	/** The travel time of the nearest painted road; Infinity when none is near. */
	readonly roadTime: Float32Array;
	readonly #columns: number;
	readonly #rows: number;
	readonly #northMeters: number;
	/** The land near a road, in metres (nearRoadMeters). */
	readonly #nearMeters: number;
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
		this.#nearMeters = nearRoadMeters(grid.cellMeters);
		this.#eastMeters = eastMetersOfRows(grid);
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
			fromDistance <= this.#nearMeters &&
			(fromDistance < distance[cell] || (fromDistance === distance[cell] && roadTime[from] < roadTime[cell]))
		) {
			distance[cell] = fromDistance;
			roadTime[cell] = roadTime[from];
		}
	}
}
