// Our side of the comparison: the region's graph, the engine's rings on it, and its roads in a grid for the
// nearest to a city. The engine's travel times to cities are in reach.ts.
//
// The graph is built without zones, so every country is open and no border costs time (the ticket compares roads
// and speeds only): the origin snaps to the nearest road of any country, as an origin at sea does.
import { computeRing, type LatLon, type MultiPolygon } from 'engine';
import { LocalProjection } from 'engine/geo';
import type { Graph } from 'engine/graph';
import { borderTable } from 'rules';
import { buildGraph } from '../build-graph.ts';
import { openOsm } from '../osm/open.ts';

/** Our graph of a region, and its roads in a grid for the nearest to a point. */
export interface OurRoads {
	readonly graph: Graph;
	readonly index: RoadIndex;
}

/** The graph of an extract, without zones: no road crosses a border, so no edge is at a border crossing either. */
export function graphWithoutZones(path: string): Graph {
	const { graph } = buildGraph(openOsm(path));
	return {
		...graph,
		nodeZone: new Uint8Array(graph.nodeLat.length),
		borderControlEdges: new Uint32Array(0),
		zones: [''],
		zoneRings: { zone: new Uint8Array(0), start: Uint32Array.of(0), lat: new Int32Array(0), lon: new Int32Array(0) },
	};
}

/** The engine's ring of N hours; undefined when it gives none (an empty ring, or no roads). */
export function ourRing(graph: Graph, origin: LatLon, hours: number): MultiPolygon | undefined {
	const result = computeRing(graph, borderTable, { origin, hours, closedCountries: [] });
	return result.outcome === 'ring' ? result.ring : undefined;
}

/** The nearest road segment to a point: from node `a` to node `b`, `fraction` of the way from `a`. */
interface NearestRoad {
	readonly a: number;
	readonly b: number;
	readonly fraction: number;
	readonly meters: number;
}

const CELL_DEGREES = 0.05;

/** The graph's edges in a grid of 0.05° cells, for the nearest road to many points (snapToRoad scans every edge). */
export class RoadIndex {
	readonly #graph: Graph;
	readonly #cells = new Map<number, number[]>();
	readonly #maxMeters: number;

	constructor(graph: Graph, maxMeters: number) {
		this.#graph = graph;
		this.#maxMeters = maxMeters;
		const { nodeLat, firstEdge, edgeTarget } = graph;
		for (let a = 0; a < nodeLat.length; a++) {
			for (let edge = firstEdge[a]; edge < firstEdge[a + 1]; edge++) {
				this.#add(a, edgeTarget[edge]);
			}
		}
	}

	/** The nearest road segment within the index's reach that `accept` takes, or undefined. */
	nearest(latDegrees: number, lonDegrees: number, accept: (a: number, b: number) => boolean = () => true): NearestRoad | undefined {
		const { nodeLat, nodeLon } = this.#graph;
		const lat = Math.round(latDegrees * 1e7);
		const lon = Math.round(lonDegrees * 1e7);
		const projection = new LocalProjection(lat, lon);
		let best: NearestRoad | undefined;
		for (const edges of this.#cellsAround(lat, lon, projection)) {
			for (let index = 0; index < edges.length; index += 2) {
				const [a, b] = [edges[index], edges[index + 1]];
				const ax = projection.x(nodeLon[a]);
				const ay = projection.y(nodeLat[a]);
				const dx = projection.x(nodeLon[b]) - ax;
				const dy = projection.y(nodeLat[b]) - ay;
				const lengthSquared = dx * dx + dy * dy;
				const fraction = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
				const meters = Math.hypot(ax + fraction * dx, ay + fraction * dy);
				if (meters <= this.#maxMeters && (best === undefined || meters < best.meters) && accept(a, b)) {
					best = { a, b, fraction, meters };
				}
			}
		}
		return best;
	}

	/** Puts the edge from node `a` to node `b` in each cell of its box. */
	#add(a: number, b: number): void {
		const { nodeLat, nodeLon } = this.#graph;
		const [row1, row2] = [Math.min(cell(nodeLat[a]), cell(nodeLat[b])), Math.max(cell(nodeLat[a]), cell(nodeLat[b]))];
		const [column1, column2] = [Math.min(cell(nodeLon[a]), cell(nodeLon[b])), Math.max(cell(nodeLon[a]), cell(nodeLon[b]))];
		for (let row = row1; row <= row2; row++) {
			for (let column = column1; column <= column2; column++) {
				const key = row * 8000 + column;
				const edges = this.#cells.get(key);
				if (edges === undefined) {
					this.#cells.set(key, [a, b]);
				} else {
					edges.push(a, b);
				}
			}
		}
	}

	/** The edges of the cells within the index's reach of a point, cell by cell, row by row. */
	#cellsAround(lat: number, lon: number, projection: LocalProjection): (readonly number[])[] {
		const rows = Math.ceil(this.#maxMeters / (projection.metersPerE7Lat * CELL_DEGREES * 1e7));
		const columns = Math.ceil(this.#maxMeters / (projection.metersPerE7Lon * CELL_DEGREES * 1e7));
		const cells: (readonly number[])[] = [];
		for (let row = cell(lat) - rows; row <= cell(lat) + rows; row++) {
			for (let column = cell(lon) - columns; column <= cell(lon) + columns; column++) {
				const edges = this.#cells.get(row * 8000 + column);
				if (edges !== undefined) {
					cells.push(edges);
				}
			}
		}
		return cells;
	}
}

/** The grid row or column of a coordinate in 1e-7 degrees, shifted to be positive. */
function cell(e7: number): number {
	return Math.floor((e7 / 1e7 + 180) / CELL_DEGREES);
}
