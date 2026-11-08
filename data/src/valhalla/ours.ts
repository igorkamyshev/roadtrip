// Our side of the comparison: the engine's rings on the region's graph, and its travel times to cities.
//
// The graph is built without zones, so every country is open and no border costs time (the ticket compares roads
// and speeds only): the origin snaps to the nearest road of any country, as an origin at sea does.
import { computeRing, type MultiPolygon } from 'engine';
import { passage } from 'engine/borders';
import { OFF_ROAD_SECONDS_PER_METER, ringContour } from 'engine/contour';
import { LocalProjection } from 'engine/geo';
import { type Graph, ZoneLocator } from 'engine/graph';
import { edgeSecondsBetween } from 'engine/snap';
import { startOnRoad } from 'engine/start';
import { TRAVEL_PER_DRIVING, traverse } from 'engine/traverse';
import { borderTable } from 'rules';
import { buildGraph } from '../build-graph.ts';
import { openOsm } from '../osm/open.ts';
import type { LatLon } from './valhalla.ts';

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

export interface OurReach {
	/** The contour of the places reached within `hours` of travel, by the engine's own contour. */
	isochrone(hours: number): MultiPolygon;
	/**
	 * Travel time to each target in hours: to the target's nearest reached road, then off-road to it at 30 km/h, as the
	 * contour counts it. Infinity beyond the reach's limit, or with no road within the index's reach.
	 */
	travelHours(targets: readonly LatLon[]): number[];
}

/**
 * Everything the engine reaches from the origin within `limitHours`: the origin's road reached as computeRing
 * reaches it (startOnRoad), then the engine's Dijkstra. Undefined when the origin has no road within 50 km.
 */
export function ourReach(graph: Graph, index: RoadIndex, origin: LatLon, limitHours: number): OurReach | undefined {
	const start = startOnRoad(graph, Math.round(origin.lat * 1e7), Math.round(origin.lon * 1e7), undefined);
	if (start === undefined) {
		return undefined;
	}
	// Every zone open, as computeRing has it with no country closed: the graph has only zone 0.
	const open = passage(graph, borderTable, [], 0);
	const { seconds } = traverse(graph, open, start.seeds, limitHours * 3600);
	const locator = new ZoneLocator(graph.zoneRings);
	return {
		isochrone(hours) {
			// Only what is reached within the hours, as a traversal up to them gives: the raster spans just that.
			const within = seconds.map((time) => (time <= hours * 3600 ? time : Infinity));
			return ringContour(graph, open, locator, { ...start, seconds: within }, -1, hours * 3600);
		},
		travelHours(targets) {
			return targets.map((target) => {
				// The nearest reached road, as the contour carries the time of the nearest painted one.
				const road = index.nearest(target.lat, target.lon, (a, b) => seconds[a] < Infinity || seconds[b] < Infinity);
				if (road === undefined) {
					return Infinity;
				}
				const ab = edgeSecondsBetween(graph, road.a, road.b);
				const ba = edgeSecondsBetween(graph, road.b, road.a);
				const viaA = ab >= 0 ? seconds[road.a] + road.fraction * ab * TRAVEL_PER_DRIVING : Infinity;
				const viaB = ba >= 0 ? seconds[road.b] + (1 - road.fraction) * ba * TRAVEL_PER_DRIVING : Infinity;
				return (Math.min(viaA, viaB) + road.meters * OFF_ROAD_SECONDS_PER_METER) / 3600;
			});
		},
	};
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
		const { nodeLat, nodeLon, firstEdge, edgeTarget } = graph;
		for (let a = 0; a < nodeLat.length; a++) {
			for (let edge = firstEdge[a]; edge < firstEdge[a + 1]; edge++) {
				const b = edgeTarget[edge];
				const [row1, row2] = [cell(nodeLat[a]), cell(nodeLat[b])].sort((one, two) => one - two);
				const [column1, column2] = [cell(nodeLon[a]), cell(nodeLon[b])].sort((one, two) => one - two);
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
		}
	}

	/** The nearest road segment within the index's reach that `accept` takes, or undefined. */
	nearest(latDegrees: number, lonDegrees: number, accept: (a: number, b: number) => boolean = () => true): NearestRoad | undefined {
		const { nodeLat, nodeLon } = this.#graph;
		const lat = Math.round(latDegrees * 1e7);
		const lon = Math.round(lonDegrees * 1e7);
		const projection = new LocalProjection(lat, lon);
		const rows = Math.ceil(this.#maxMeters / (projection.metersPerE7Lat * CELL_DEGREES * 1e7));
		const columns = Math.ceil(this.#maxMeters / (projection.metersPerE7Lon * CELL_DEGREES * 1e7));
		let best: NearestRoad | undefined;
		for (let row = cell(lat) - rows; row <= cell(lat) + rows; row++) {
			for (let column = cell(lon) - columns; column <= cell(lon) + columns; column++) {
				const edges = this.#cells.get(row * 8000 + column) ?? [];
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
		}
		return best;
	}
}

/** The grid row or column of a coordinate in 1e-7 degrees, shifted to be positive. */
function cell(e7: number): number {
	return Math.floor((e7 / 1e7 + 180) / CELL_DEGREES);
}
