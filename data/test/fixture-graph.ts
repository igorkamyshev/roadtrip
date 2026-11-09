import { fileURLToPath } from 'node:url';
import type { Graph } from 'engine/graph';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';

/**
 * The graph the builder makes of `fixtures/<name>`, a whole fixture: every node its ways refer to is in the file.
 * The builder drops a road's segments to a node the file lacks, as at an extract's edge, so a mistyped ref would
 * take a road out of the graph without a word. A cut extract (`edge-of-extract.osm`) goes through `buildGraph`.
 */
export function fixtureGraph(name: string): Graph {
	const path = fixturePath(name);
	const missing = missingRefs(path);
	if (missing.length > 0) {
		throw new Error(`${name}: ways refer to nodes the file lacks: ${missing.join(', ')}`);
	}
	return buildGraph(openOsm(path)).graph;
}

export function fixturePath(name: string): string {
	return fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
}

/** `way <id> → node <ref>` for each node a way of the file refers to that the file lacks. */
function missingRefs(path: string): string[] {
	const source = openOsm(path);
	const nodes = new Set<number>();
	source.read({
		node(node) {
			nodes.add(node.id);
		},
	});
	const missing: string[] = [];
	source.read({
		way(way) {
			for (const ref of way.refs.filter((id) => !nodes.has(id))) {
				missing.push(`way ${way.id} → node ${ref}`);
			}
		},
	});
	return missing;
}
