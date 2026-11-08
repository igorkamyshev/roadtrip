// The version of the engine's results, and the fingerprint of the sources they depend on (engine/AGENTS.md,
// «Engine version»).

/**
 * The version of the engine's results. It is part of the data version in the ring cache key (spec «Кэш колец»),
 * so bump it by one in the change that makes the same input give another result.
 */
export const ENGINE_VERSION = 5;

/**
 * The sources a ring's answer depends on, from the repository's root: a change to one of them may give another
 * result for the same graph, border table and request. Not this file, nor tests.
 */
export const ENGINE_SOURCES: readonly string[] = [
	// The engine: the ×1.2 of travel time, the 30 km/h off-road and the snapping (the 50 km limit, the 50 nodes
	// reachable from the road), the contour (cell size, near-road radius, simplification, marching squares), how it
	// reads the border table, the graph's format (GRAPH_FORMAT_VERSION) and the result's.
	'engine/src/borders.ts',
	'engine/src/contour.ts',
	'engine/src/geo.ts',
	'engine/src/graph.ts',
	'engine/src/heap.ts',
	'engine/src/index.ts',
	'engine/src/protocol.ts',
	'engine/src/snap.ts',
	'engine/src/start.ts',
	'engine/src/trace.ts',
	'engine/src/traverse.ts',
	'engine/src/zones.ts',
	// The graph's builder: the speeds and which ways are roads, the zones it makes and each road node's, the edges it
	// marks at a border crossing, which nodes of the roads it keeps, and how it reads an extract.
	'data/src/border-controls.ts',
	'data/src/build-graph.ts',
	'data/src/node-ids.ts',
	'data/src/osm/pbf.ts',
	'data/src/roads.ts',
	'data/src/zone-cells.ts',
	'data/src/zones.ts',
];

/**
 * SHA-256 of the texts of ENGINE_SOURCES one after another in the order of their paths, with LF line endings, in
 * hex; data/test/engine-fingerprint.test.ts checks it. A new fingerprint with the same ENGINE_VERSION says the
 * change gives every ring as before.
 */
export const ENGINE_FINGERPRINT = 'af3e8077941fba8cc590e200e8746c7438b5dd6711a44ac4abb33f70cc430655';
