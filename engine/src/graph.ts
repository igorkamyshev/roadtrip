// The road graph: what the builder in data writes and the engine reads (spec «Набор данных», «Граф»). Typed
// arrays only, so the graph of the world (12 M nodes, 25 M edges, 357 MB in 2026-11: docs/world-build.md) loads
// without parsing. Nodes are junctions and ends of roads: the builder collapses chains of degree-2 nodes into one
// edge each.
//
// A change to what these arrays mean changes the result of the engine: bump ENGINE_VERSION (engine/AGENTS.md).
import { pointsBounds, ZoneLocator, type Bounds } from './zones.ts';

export { pointsBounds, ZoneLocator, type Bounds };

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

/** The graph's arrays in the order the file holds them. */
const ARRAY_NAMES = [
	'nodeLat',
	'nodeLon',
	'nodeZone',
	'firstEdge',
	'edgeTarget',
	'edgeSeconds',
	'borderControlEdges',
	'ringZone',
	'ringStart',
	'ringLat',
	'ringLon',
] as const;

type ArrayName = (typeof ARRAY_NAMES)[number];

/** Where an array starts in the file and how many elements it has. */
interface Placement {
	readonly offset: number;
	readonly length: number;
}

interface FileHeader {
	readonly format: number;
	readonly zones: readonly string[];
	readonly arrays: Readonly<Record<ArrayName, Placement>>;
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
	// The header's length depends on the offsets, which depend on its length: lay the arrays out after a header
	// slot big enough for any offsets.
	const draft = (start: number) => {
		let offset = start;
		const placed = byName((name) => {
			const placement = { offset, length: arrays[name].length };
			offset = align(offset + arrays[name].byteLength);
			return placement;
		});
		return { header: { format: GRAPH_FORMAT_VERSION, zones: graph.zones, arrays: placed } satisfies FileHeader, end: offset };
	};
	const slot = align(MAGIC.length + 4 + new TextEncoder().encode(JSON.stringify(draft(Number.MAX_SAFE_INTEGER).header)).length);
	const { header, end } = draft(slot);
	const bytes = new Uint8Array(end);
	bytes.set(new TextEncoder().encode(MAGIC));
	const headerBytes = new TextEncoder().encode(JSON.stringify(header));
	new DataView(bytes.buffer).setUint32(MAGIC.length, headerBytes.length, true);
	bytes.set(headerBytes, MAGIC.length + 4);
	for (const name of ARRAY_NAMES) {
		const array = arrays[name];
		bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), header.arrays[name].offset);
	}
	return bytes;
}

/** A record of every array name, its values made by name in the order of ARRAY_NAMES. */
function byName<Value>(make: (name: ArrayName) => Value): Record<ArrayName, Value> {
	return {
		nodeLat: make('nodeLat'),
		nodeLon: make('nodeLon'),
		nodeZone: make('nodeZone'),
		firstEdge: make('firstEdge'),
		edgeTarget: make('edgeTarget'),
		edgeSeconds: make('edgeSeconds'),
		borderControlEdges: make('borderControlEdges'),
		ringZone: make('ringZone'),
		ringStart: make('ringStart'),
		ringLat: make('ringLat'),
		ringLon: make('ringLon'),
	};
}

/** The graph in a file `encodeGraph` wrote. Its arrays are views of `bytes` (of a copy, if `bytes` is misaligned). */
export function decodeGraph(bytes: Uint8Array): Graph {
	if (new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC) {
		throw new Error('These bytes are not a roadtrip graph file');
	}
	const aligned = bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
	const headerLength = new DataView(aligned.buffer, aligned.byteOffset).getUint32(MAGIC.length, true);
	const header = readHeader(new TextDecoder().decode(aligned.subarray(MAGIC.length + 4, MAGIC.length + 4 + headerLength)));
	const view = <View>(Type: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => View, name: ArrayName): View => {
		const { offset, length } = header.arrays[name];
		return new Type(aligned.buffer, aligned.byteOffset + offset, length);
	};
	return {
		nodeLat: view(Int32Array, 'nodeLat'),
		nodeLon: view(Int32Array, 'nodeLon'),
		nodeZone: view(Uint8Array, 'nodeZone'),
		firstEdge: view(Uint32Array, 'firstEdge'),
		edgeTarget: view(Uint32Array, 'edgeTarget'),
		edgeSeconds: view(Uint16Array, 'edgeSeconds'),
		borderControlEdges: view(Uint32Array, 'borderControlEdges'),
		zones: header.zones,
		zoneRings: {
			zone: view(Uint8Array, 'ringZone'),
			start: view(Uint32Array, 'ringStart'),
			lat: view(Int32Array, 'ringLat'),
			lon: view(Int32Array, 'ringLon'),
		},
	};
}

/** The file's header, of this engine's format. */
function readHeader(json: string): FileHeader {
	const header: unknown = JSON.parse(json);
	const format = typeof header === 'object' && header !== null && 'format' in header ? header.format : undefined;
	if (format !== GRAPH_FORMAT_VERSION) {
		throw new Error(`The graph file has format ${String(format)}, this engine reads ${GRAPH_FORMAT_VERSION}`);
	}
	if (!isFileHeader(header)) {
		throw new Error(`The graph file's header is not one of format ${GRAPH_FORMAT_VERSION}`);
	}
	return header;
}

function isFileHeader(value: unknown): value is FileHeader {
	if (typeof value !== 'object' || value === null || !('zones' in value) || !('arrays' in value)) {
		return false;
	}
	const { zones, arrays } = value;
	return (
		Array.isArray(zones) &&
		zones.every((zone) => typeof zone === 'string') &&
		typeof arrays === 'object' &&
		arrays !== null &&
		ARRAY_NAMES.every((name) => isPlacement(Reflect.get(arrays, name)))
	);
}

function isPlacement(value: unknown): value is Placement {
	return (
		typeof value === 'object' &&
		value !== null &&
		'offset' in value &&
		'length' in value &&
		Number.isInteger(value.offset) &&
		Number.isInteger(value.length)
	);
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
		if (borderControl[edge] !== 0) {
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
		borderControlEdges: Uint32Array.from(borderControlSlots).toSorted(),
		zones: parts.zones,
		zoneRings: parts.zoneRings,
	};
}
