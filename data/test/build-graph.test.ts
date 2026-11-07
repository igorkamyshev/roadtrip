// The builder's output: the graph format the engine reads (engine/src/graph.ts). What the engine makes of it is
// in ring.test.ts; here, what the graph holds.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeGraph, encodeGraph, type Graph } from 'engine/graph';
import { afterAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';
import { fixtureGraph, fixturePath } from './fixture-graph.ts';
import { writePbf } from './write-pbf.ts';

/** Each edge as "from → to", a node by its "lat,lon zone"; only those `keep` keeps, by edge index. */
function edges(graph: Graph, keep: (edge: number) => boolean = () => true): string[] {
	const node = (index: number) => `${graph.nodeLat[index] / 1e7},${graph.nodeLon[index] / 1e7} ${graph.zones[graph.nodeZone[index]]}`;
	const result: string[] = [];
	for (let from = 0; from < graph.nodeLat.length; from++) {
		for (let edge = graph.firstEdge[from]; edge < graph.firstEdge[from + 1]; edge++) {
			if (keep(edge)) {
				result.push(`${node(from)} → ${node(graph.edgeTarget[edge])}`);
			}
		}
	}
	return result.sort();
}

describe('a PBF extract', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-pbf-'));
	afterAll(() => rmSync(directory, { recursive: true }));

	it.each(['straight-road.osm', 'two-countries.osm', 'roads.osm', 'chains.osm', 'borders.osm', 'closed-territory.osm', 'zones.osm'])(
		'gives the graph its OSM XML gives: %s',
		(name) => {
			const pbf = join(directory, `${name}.pbf`);
			writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: false });

			expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
		},
	);

	it.each(['straight-road.osm', 'two-countries.osm', 'borders.osm'])('with the locations on its ways and no untagged nodes gives the same graph: %s', (name) => {
		const pbf = join(directory, `${name}.locations.pbf`);
		writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: true });

		expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
	});
});

describe('a graph file', () => {
	it('reads back as the graph it was written from', () => {
		const graph = fixtureGraph('borders.osm');

		expect(decodeGraph(encodeGraph(graph))).toEqual(graph);
	});

	it('reads back from bytes at any offset of a buffer', () => {
		const graph = fixtureGraph('two-countries.osm');
		const bytes = encodeGraph(graph);
		const shifted = new Uint8Array(bytes.length + 3);
		shifted.set(bytes, 3);

		expect(decodeGraph(shifted.subarray(3))).toEqual(graph);
	});

	it('refuses bytes that are not a graph file', () => {
		expect(() => decodeGraph(new TextEncoder().encode('<osm version="0.6"></osm>'))).toThrow('not a roadtrip graph');
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

	it('marks the edges across a border that pass a barrier=border_control', () => {
		const graph = fixtureGraph('borders.osm');
		const marked = new Set(graph.borderControlEdges);

		expect(edges(graph, (edge) => marked.has(edge))).toEqual(
			[
				['0.2,0.9 AAA', '0.2,1.1 BBB'],
				['0.3,0.99 AAA', '0.3,1.1 BBB'],
				['0.3,1.9 BBB', '0.3,2.1 CCC'],
			]
				.flatMap(([one, two]) => [`${one} → ${two}`, `${two} → ${one}`])
				.sort(),
		);
	});
});
