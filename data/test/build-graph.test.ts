// The builder's output: the graph format the engine reads (engine/src/graph.ts). What the engine makes of it is
// in ring.test.ts; here, what the graph holds.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Graph } from 'engine/graph';
import { afterAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';
import { fixtureGraph, fixturePath } from './fixture-graph.ts';
import { writePbf } from './write-pbf.ts';

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

describe('a PBF extract', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-pbf-'));
	afterAll(() => rmSync(directory, { recursive: true }));

	it.each(['straight-road.osm', 'two-countries.osm', 'roads.osm', 'chains.osm'])('gives the graph its OSM XML gives: %s', (name) => {
		const pbf = join(directory, `${name}.pbf`);
		writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: false });

		expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
	});

	it.each(['straight-road.osm', 'two-countries.osm'])('with the locations on its ways and no untagged nodes gives the same graph: %s', (name) => {
		const pbf = join(directory, `${name}.locations.pbf`);
		writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: true });

		expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
	});
});

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
