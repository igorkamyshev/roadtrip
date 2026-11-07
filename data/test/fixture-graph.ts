import { fileURLToPath } from 'node:url';
import type { Graph } from 'engine/graph';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';

/** The graph the builder makes of `fixtures/<name>`. */
export function fixtureGraph(name: string): Graph {
	return buildGraph(openOsm(fixturePath(name))).graph;
}

export function fixturePath(name: string): string {
	return fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
}
