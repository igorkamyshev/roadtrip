// The graph's roads in a grid, for the nearest road to many points: `snapToRoad` (engine/src/snap.ts) scans every
// edge, too slow for the cities of a region (the Valhalla comparison) or the places of the world (access-points.ts).
import { E7, LocalProjection, METERS_PER_DEGREE } from 'engine/geo';
import type { Graph } from 'engine/graph';
import { edgeSecondsBetween, nearestOnRoad } from 'engine/snap';
import type { Point } from './cities-file.ts';

/** A road segment near a point: from node `a` to node `b`, its point nearest the point `fraction` of the way from `a`, `meters` away. */
export interface NearRoad {
	readonly a: number;
	readonly b: number;
	readonly fraction: number;
	readonly meters: number;
}

/** The cells, 1e-7 degrees: 0.05°, 5.6 km. */
const CELL = 500_000;
const LON_CELLS = (360 * E7) / CELL;
const latCell = (lat: number) => Math.floor((lat + 90 * E7) / CELL);
const lonCell = (lon: number) => Math.floor((lon + 180 * E7) / CELL);
/** A cell's number; the cells of longitude go round past 180°. */
const cellOf = (row: number, column: number) => row * LON_CELLS + (((column % LON_CELLS) + LON_CELLS) % LON_CELLS);

/** A box of cells: its first and last rows and columns. */
interface Cells {
	readonly rows: readonly [number, number];
	readonly columns: readonly [number, number];
}

/** The cells within `meters` of a point in 1e-7 degrees. */
function cellsAround(lat: number, lon: number, meters: number): Cells {
	const latReach = (meters / METERS_PER_DEGREE) * E7;
	// A degree of longitude is shortest at the reach's edge farthest from the equator.
	const cos = Math.cos(((Math.min(90 * E7, Math.abs(lat) + latReach) / E7) * Math.PI) / 180);
	const lonReach = cos > meters / (METERS_PER_DEGREE * 180) ? latReach / cos : 180 * E7;
	const west = lonCell(lon - lonReach);
	return {
		rows: [latCell(lat - latReach), latCell(lat + latReach)],
		columns: [west, Math.min(lonCell(lon + lonReach), west + LON_CELLS - 1)],
	};
}

function eachCell({ rows, columns }: Cells, onCell: (cell: number) => void): void {
	for (let row = rows[0]; row <= rows[1]; row++) {
		for (let column = columns[0]; column <= columns[1]; column++) {
			onCell(cellOf(row, column));
		}
	}
}

/**
 * The roads of a graph in cells, each road in every cell its box touches, each way of a two-way road once: the edge
 * from the smaller node stands for both. With `near`, only the cells within `reachMeters` of those points (degrees),
 * so the world's tens of millions of roads need not all be held. The roads are kept in typed arrays, cell after cell.
 */
export class RoadIndex {
	readonly #graph: Graph;
	readonly #reachMeters: number;
	/** Each cell's slot in `#start`. */
	readonly #slots = new Map<number, number>();
	/** The roads of slot s are `#start[s]` … `#start[s + 1] − 1`, their ends at twice that in `#ends`. */
	readonly #start: Uint32Array;
	readonly #ends: Uint32Array;

	constructor(graph: Graph, reachMeters: number, near?: readonly Point[]) {
		this.#graph = graph;
		this.#reachMeters = reachMeters;
		for (const { lat, lon } of near ?? []) {
			eachCell(cellsAround(Math.round(lat * E7), Math.round(lon * E7), reachMeters), (cell) => {
				this.#slot(cell, true);
			});
		}
		const counts: number[] = [];
		this.#eachRoad(near === undefined, (slot) => {
			counts[slot] = (counts[slot] ?? 0) + 1;
		});
		this.#start = new Uint32Array(this.#slots.size + 1);
		for (let slot = 0; slot < this.#slots.size; slot++) {
			this.#start[slot + 1] = this.#start[slot] + (counts[slot] ?? 0);
		}
		this.#ends = new Uint32Array(this.#start[this.#slots.size] * 2);
		const filled = this.#start.slice(0, -1);
		this.#eachRoad(false, (slot, a, b) => {
			this.#ends[filled[slot] * 2] = a;
			this.#ends[filled[slot] * 2 + 1] = b;
			filled[slot] += 1;
		});
	}

	/** Calls `onRoad` with the nearest point of each road within the index's reach of a point (degrees); a road may come more than once. */
	each(latDegrees: number, lonDegrees: number, onRoad: (road: NearRoad) => void): void {
		const lat = Math.round(latDegrees * E7);
		const lon = Math.round(lonDegrees * E7);
		const pointOn = nearestOnRoad(this.#graph, new LocalProjection(lat, lon));
		eachCell(cellsAround(lat, lon, this.#reachMeters), (cell) => {
			const slot = this.#slots.get(cell);
			if (slot === undefined) {
				return;
			}
			for (let road = this.#start[slot]; road < this.#start[slot + 1]; road++) {
				const a = this.#ends[road * 2];
				const b = this.#ends[road * 2 + 1];
				const { fraction, meters } = pointOn(a, b);
				if (meters <= this.#reachMeters) {
					onRoad({ a, b, fraction, meters });
				}
			}
		});
	}

	/** The nearest road segment within the index's reach that `accept` takes, or undefined. */
	nearest(latDegrees: number, lonDegrees: number, accept: (a: number, b: number) => boolean = () => true): NearRoad | undefined {
		let best: NearRoad | undefined;
		this.each(latDegrees, lonDegrees, (road) => {
			if ((best === undefined || road.meters < best.meters) && accept(road.a, road.b)) {
				best = road;
			}
		});
		return best;
	}

	/** The cell's slot; a new one with `add`, else undefined for a cell without one. */
	#slot(cell: number, add: boolean): number | undefined {
		const slot = this.#slots.get(cell);
		if (slot !== undefined || !add) {
			return slot;
		}
		this.#slots.set(cell, this.#slots.size);
		return this.#slots.size - 1;
	}

	/** Calls `onRoad` for each road and each cell with a slot that its box touches, giving cells slots with `add`. */
	#eachRoad(add: boolean, onRoad: (slot: number, a: number, b: number) => void): void {
		const graph = this.#graph;
		const { nodeLat, nodeLon, firstEdge, edgeTarget } = graph;
		for (let a = 0; a < nodeLat.length; a++) {
			for (let edge = firstEdge[a]; edge < firstEdge[a + 1]; edge++) {
				const b = edgeTarget[edge];
				if (b < a && edgeSecondsBetween(graph, b, a) >= 0) {
					continue;
				}
				const rows = [latCell(Math.min(nodeLat[a], nodeLat[b])), latCell(Math.max(nodeLat[a], nodeLat[b]))] as const;
				const columns = [lonCell(Math.min(nodeLon[a], nodeLon[b])), lonCell(Math.max(nodeLon[a], nodeLon[b]))] as const;
				eachCell({ rows, columns }, (cell) => {
					const slot = this.#slot(cell, add);
					if (slot !== undefined) {
						onRoad(slot, a, b);
					}
				});
			}
		}
	}
}
