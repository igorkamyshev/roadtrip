// The builder's output: the graph format the engine reads (engine/src/graph.ts). What the engine makes of it is
// in ring.test.ts; here, what the graph holds.
import type { Graph } from 'engine/graph';
import { describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixture-graph.ts';

/** Each edge as "from → to", a node by its "lat,lon zone". */
function edges(graph: Graph): string[] {
	const node = (index: number) => `${graph.nodeLat[index] / 1e7},${graph.nodeLon[index] / 1e7} ${graph.zones[graph.nodeZone[index]]}`;
	const result: string[] = [];
	for (let from = 0; from < graph.nodeLat.length; from++) {
		for (let edge = graph.firstEdge[from]; edge < graph.firstEdge[from + 1]; edge++) {
			result.push(`${node(from)} → ${node(graph.edgeTarget[edge])}`);
		}
	}
	return result.sort();
}

describe('the graph', () => {
	it('collapses a chain of degree-2 nodes into one edge each way, with its driving time', () => {
		const graph = fixtureGraph('straight-road.osm');

		expect(edges(graph)).toEqual(['0,0 AAA → 0,2 AAA', '0,2 AAA → 0,0 AAA']);
		// 222.4 km at 60 km/h.
		expect([...graph.edgeSeconds]).toEqual([13343, 13343]);
	});

	it('collapses chains across ways, keeps junctions, and keeps the nodes on both sides of a border', () => {
		expect(edges(fixtureGraph('chains.osm'))).toEqual(
			[
				['0,0.1 AAA', '0,0.4 AAA'],
				['0,0.4 AAA', '0.1,0.4 AAA'],
				['0,0.4 AAA', '0,0.95 AAA'],
				['0,0.95 AAA', '0,1.05 BBB'],
				['0,1.05 BBB', '0,1.5 BBB'],
			]
				.flatMap(([one, two]) => [`${one} → ${two}`, `${two} → ${one}`])
				.sort(),
		);
	});
});
