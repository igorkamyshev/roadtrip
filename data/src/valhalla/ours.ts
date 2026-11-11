// Our side of the comparison: the region's graph and the engine's rings on it; its roads in a grid for the nearest to
// a city are a RoadIndex (src/road-index.ts). The engine's travel times to cities are in reach.ts.
//
// The graph is built without zones, so every country is open and no border costs time (the ticket compares roads
// and speeds only): the origin snaps to the nearest road of any country, as an origin at sea does.
import { computeRing, type LatLon, type MultiPolygon } from 'engine';
import type { Graph } from 'engine/graph';
import { borderTable } from 'rules';
import { buildGraph } from '../build-graph.ts';
import { openOsm } from '../osm/open.ts';
import type { RoadIndex } from '../road-index.ts';

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
	const result = computeRing(graph, borderTable, { origin, lowerHours: hours - 1, upperHours: hours, closedCountries: [] });
	return result.outcome === 'ring' ? result.ring : undefined;
}
