// The road graph: what the builder in data writes and the engine reads (spec «Набор данных», «Граф»). Typed
// arrays only, so the graph of the world (12 M nodes, 25 M edges, 357 MB in 2026-11: docs/world-build.md) loads
// without parsing. Nodes are junctions and ends of roads: the builder collapses chains of degree-2 nodes into one
// edge each.
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
	 * The edges between two zones that pass within BORDER_CROSSING_METERS of a `barrier=border_control` node of
	 * OSM: the edges across a border at a border crossing, unless the border table says otherwise. Ascending.
	 */
	readonly borderControlEdges: Uint32Array;
	/**
	 * The zone codes: a country's ISO 3166-1 alpha-3 as Sherpa has it (`RKS` for Kosovo, `NX` for Northern
	 * Cyprus), or a closed territory's code (rules' `closedTerritories`). Index 0 is '', no zone: the sea, a gap
	 * between polygons, or a country whose polygon the extract does not hold. Where polygons overlap, as a
	 * territory inside its country, a point is in the zone listed first, so the parts of countries come first.
	 */
	readonly zones: readonly string[];
	readonly zoneRings: ZoneRings;
}

/** The longest driving time an edge holds; the builder splits a longer chain. */
export const MAX_EDGE_SECONDS = 0xffff;

/** A node's zone is a byte, and zone 0 is no zone. */
export const MAX_ZONES = 0xff;

/**
 * A road across a border is at a border crossing when it passes this close to one: a `barrier=border_control`
 * node of OSM, which often sits on the road a few hundred metres back from the border line, or a crossing of the
 * border table.
 */
export const BORDER_CROSSING_METERS = 2000;

/** The edges of a graph in any order: edge i goes from `from[i]` to `to[i]`. */
export interface EdgeList {
	readonly from: Uint32Array;
	readonly to: Uint32Array;
	readonly seconds: Uint16Array;
	/** 1 for an edge between two zones that passes a `barrier=border_control` (`Graph.borderControlEdges`). */
	readonly borderControl: Uint8Array;
}

export interface GraphParts {
	readonly nodeLat: Int32Array;
	readonly nodeLon: Int32Array;
	readonly nodeZone: Uint8Array;
	readonly edges: EdgeList;
	readonly zones: readonly string[];
	readonly zoneRings: ZoneRings;
}

/**
 * The version of the graph file. Bump it when the arrays or their meaning change, so an engine never reads a
 * file of another layout.
 */
export const GRAPH_FORMAT_VERSION = 2;

const MAGIC = 'RTGRAPH\n';

type ArrayName =
	| 'nodeLat'
	| 'nodeLon'
	| 'nodeZone'
	| 'firstEdge'
	| 'edgeTarget'
	| 'edgeSeconds'
	| 'borderControlEdges'
	| 'ringZone'
	| 'ringStart'
	| 'ringLat'
	| 'ringLon';

const ARRAY_TYPES = {
	nodeLat: Int32Array,
	nodeLon: Int32Array,
	nodeZone: Uint8Array,
	firstEdge: Uint32Array,
	edgeTarget: Uint32Array,
	edgeSeconds: Uint16Array,
	borderControlEdges: Uint32Array,
	ringZone: Uint8Array,
	ringStart: Uint32Array,
	ringLat: Int32Array,
	ringLon: Int32Array,
} as const;

interface FileHeader {
	readonly format: number;
	readonly zones: readonly string[];
	/** Where each array starts in the file and how many elements it has. */
	readonly arrays: Readonly<Record<ArrayName, { readonly offset: number; readonly length: number }>>;
}

/**
 * The graph as a file: the magic `RTGRAPH\n`, the byte length of a JSON header (uint32), the header, then each
 * array as is, 8-byte aligned, so `decodeGraph` takes views of it without a copy. Little-endian, as the typed
 * arrays of every platform the engine runs on.
 */
export function encodeGraph(graph: Graph): Uint8Array {
	const arrays: Record<ArrayName, Int32Array | Uint32Array | Uint16Array | Uint8Array> = {
		nodeLat: graph.nodeLat,
		nodeLon: graph.nodeLon,
		nodeZone: graph.nodeZone,
		firstEdge: graph.firstEdge,
		edgeTarget: graph.edgeTarget,
		edgeSeconds: graph.edgeSeconds,
		borderControlEdges: graph.borderControlEdges,
		ringZone: graph.zoneRings.zone,
		ringStart: graph.zoneRings.start,
		ringLat: graph.zoneRings.lat,
		ringLon: graph.zoneRings.lon,
	};
	const names = Object.keys(ARRAY_TYPES) as ArrayName[];
	// The header's length depends on the offsets, which depend on its length: lay the arrays out after a header
	// slot big enough for any offsets.
	const draft = (start: number) => {
		const placed = {} as Record<ArrayName, { offset: number; length: number }>;
		let offset = start;
		for (const name of names) {
			placed[name] = { offset, length: arrays[name].length };
			offset = align(offset + arrays[name].byteLength);
		}
		return { header: { format: GRAPH_FORMAT_VERSION, zones: graph.zones, arrays: placed } satisfies FileHeader, end: offset };
	};
	const slot = align(MAGIC.length + 4 + new TextEncoder().encode(JSON.stringify(draft(Number.MAX_SAFE_INTEGER).header)).length);
	const { header, end } = draft(slot);
	const bytes = new Uint8Array(end);
	bytes.set(new TextEncoder().encode(MAGIC));
	const headerBytes = new TextEncoder().encode(JSON.stringify(header));
	new DataView(bytes.buffer).setUint32(MAGIC.length, headerBytes.length, true);
	bytes.set(headerBytes, MAGIC.length + 4);
	for (const name of names) {
		const array = arrays[name];
		bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), header.arrays[name].offset);
	}
	return bytes;
}

/** The graph in a file `encodeGraph` wrote. Its arrays are views of `bytes` (of a copy, if `bytes` is misaligned). */
export function decodeGraph(bytes: Uint8Array): Graph {
	if (new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) {
		throw new Error('These bytes are not a roadtrip graph file');
	}
	const aligned = bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
	const headerLength = new DataView(aligned.buffer, aligned.byteOffset).getUint32(MAGIC.length, true);
	const header = JSON.parse(new TextDecoder().decode(aligned.subarray(MAGIC.length + 4, MAGIC.length + 4 + headerLength))) as FileHeader;
	if (header.format !== GRAPH_FORMAT_VERSION) {
		throw new Error(`The graph file has format ${header.format}, this engine reads ${GRAPH_FORMAT_VERSION}`);
	}
	const array = <Name extends ArrayName>(name: Name): InstanceType<(typeof ARRAY_TYPES)[Name]> => {
		const { offset, length } = header.arrays[name];
		return new ARRAY_TYPES[name](aligned.buffer as ArrayBuffer, aligned.byteOffset + offset, length) as InstanceType<(typeof ARRAY_TYPES)[Name]>;
	};
	return {
		nodeLat: array('nodeLat'),
		nodeLon: array('nodeLon'),
		nodeZone: array('nodeZone'),
		firstEdge: array('firstEdge'),
		edgeTarget: array('edgeTarget'),
		edgeSeconds: array('edgeSeconds'),
		borderControlEdges: array('borderControlEdges'),
		zones: header.zones,
		zoneRings: { zone: array('ringZone'), start: array('ringStart'), lat: array('ringLat'), lon: array('ringLon') },
	};
}

function align(offset: number): number {
	return Math.ceil(offset / 8) * 8;
}

/** A graph of `parts`, its edges grouped by the node they leave (in their given order within a node). */
export function createGraph(parts: GraphParts): Graph {
	const nodeCount = parts.nodeLat.length;
	if (parts.zones.length > MAX_ZONES + 1 || parts.zones[0] !== '') {
		throw new RangeError(`zones must start with '' and hold at most ${MAX_ZONES} more`);
	}
	const { from, to, seconds, borderControl } = parts.edges;
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
	const borderControlSlots: number[] = [];
	for (let edge = 0; edge < from.length; edge++) {
		const slot = next[from[edge]]++;
		edgeTarget[slot] = to[edge];
		edgeSeconds[slot] = seconds[edge];
		if (borderControl[edge]) {
			borderControlSlots.push(slot);
		}
	}
	return {
		nodeLat: parts.nodeLat,
		nodeLon: parts.nodeLon,
		nodeZone: parts.nodeZone,
		firstEdge,
		edgeTarget,
		edgeSeconds,
		borderControlEdges: Uint32Array.from(borderControlSlots).sort(),
		zones: parts.zones,
		zoneRings: parts.zoneRings,
	};
}
