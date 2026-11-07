// The road graph: what the builder in data writes and the engine reads (spec «Набор данных», «Граф»). Typed
// arrays only, so a graph of the world (~25–30 M nodes, ~50 M edges) loads without parsing. Nodes are
// junctions and ends of roads: the builder collapses chains of degree-2 nodes into one edge each.
//
// A change to what these arrays mean changes the result of the engine: bump ENGINE_VERSION (engine/AGENTS.md).
import { ZoneLocator } from './zones.ts';

export { ZoneLocator };

/**
 * The polygons of the zones, as rings. A point is in a zone when it is inside an odd number of the zone's rings,
 * so outer rings, holes and enclaves need no roles.
 */
export interface ZoneRings {
	/** The zone of each ring, an index into `Graph.zones`. */
	readonly zone: Uint8Array;
	/** The points of ring r are `start[r]` … `start[r + 1] − 1`. Length: ring count + 1. */
	readonly start: Uint32Array;
	/** Latitude of each point, in 1e-7 degrees. A ring's last point repeats its first. */
	readonly lat: Int32Array;
	/** Longitude of each point, in 1e-7 degrees. */
	readonly lon: Int32Array;
}

export interface Graph {
	/** Latitude of each node, in 1e-7 degrees (OSM's own precision). */
	readonly nodeLat: Int32Array;
	/** Longitude of each node, in 1e-7 degrees. */
	readonly nodeLon: Int32Array;
	/** The zone of each node, an index into `zones`; 0 when the node is in no zone's polygon. */
	readonly nodeZone: Uint8Array;
	/** The edges out of node n are `firstEdge[n]` … `firstEdge[n + 1] − 1`. Length: node count + 1. */
	readonly firstEdge: Uint32Array;
	/** The node each edge leads to. */
	readonly edgeTarget: Uint32Array;
	/** Driving time of each edge, in whole seconds (without the ×1.2 of travel time). */
	readonly edgeSeconds: Uint16Array;
	/**
	 * The zone codes: a country's ISO 3166-1 alpha-3, as Sherpa has it. Index 0 is '', no zone: the sea, or a
	 * country whose polygon the extract does not hold.
	 */
	readonly zones: readonly string[];
	readonly zoneRings: ZoneRings;
}

/** The longest driving time an edge holds; the builder splits a longer chain. */
export const MAX_EDGE_SECONDS = 0xffff;

/** A node's zone is a byte, and zone 0 is no zone. */
export const MAX_ZONES = 0xff;

/** The edges of a graph in any order: edge i goes from `from[i]` to `to[i]`. */
export interface EdgeList {
	readonly from: Uint32Array;
	readonly to: Uint32Array;
	readonly seconds: Uint16Array;
}

export interface GraphParts {
	readonly nodeLat: Int32Array;
	readonly nodeLon: Int32Array;
	readonly nodeZone: Uint8Array;
	readonly edges: EdgeList;
	readonly zones: readonly string[];
	readonly zoneRings: ZoneRings;
}

/** A graph of `parts`, its edges grouped by the node they leave (in their given order within a node). */
export function createGraph(parts: GraphParts): Graph {
	const nodeCount = parts.nodeLat.length;
	if (parts.zones.length > MAX_ZONES + 1 || parts.zones[0] !== '') {
		throw new RangeError(`zones must start with '' and hold at most ${MAX_ZONES} more`);
	}
	const { from, to, seconds } = parts.edges;
	const firstEdge = new Uint32Array(nodeCount + 1);
	for (const node of from) {
		firstEdge[node + 1]++;
	}
	for (let node = 0; node < nodeCount; node++) {
		firstEdge[node + 1] += firstEdge[node];
	}
	const next = firstEdge.slice(0, nodeCount);
	const edgeTarget = new Uint32Array(from.length);
	const edgeSeconds = new Uint16Array(from.length);
	for (let edge = 0; edge < from.length; edge++) {
		const slot = next[from[edge]]++;
		edgeTarget[slot] = to[edge];
		edgeSeconds[slot] = seconds[edge];
	}
	return {
		nodeLat: parts.nodeLat,
		nodeLon: parts.nodeLon,
		nodeZone: parts.nodeZone,
		firstEdge,
		edgeTarget,
		edgeSeconds,
		zones: parts.zones,
		zoneRings: parts.zoneRings,
	};
}
