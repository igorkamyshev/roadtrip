// The builder's output: the graph format the engine reads (engine/src/graph.ts). What the engine makes of it is
// in ring.test.ts; here, what the graph holds.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeGraph, encodeGraph, type Graph, MAX_EDGE_SECONDS } from 'engine/graph';
import type { BorderTable } from 'rules';
import { afterAll, describe, expect, it } from 'vitest';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';
import type { OsmSource } from '../src/osm/source.ts';
import { fixtureGraph, fixturePath } from './fixture-graph.ts';
import { crossing, pair, rules } from './rules.ts';
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
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	it.each([
		'straight-road.osm',
		'two-countries.osm',
		'roads.osm',
		'chains.osm',
		'borders.osm',
		'closed-territory.osm',
		'zones.osm',
		'edge-of-extract.osm',
		'partial-zone.osm',
	])('gives the graph its OSM XML gives: %s', (name) => {
		const pbf = join(directory, `${name}.pbf`);
		writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: false });

		expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
	});

	it.each(['straight-road.osm', 'two-countries.osm', 'borders.osm', 'edge-of-extract.osm', 'partial-zone.osm'])(
		'with the locations on its ways and no untagged nodes gives the same graph: %s',
		(name) => {
			const pbf = join(directory, `${name}.locations.pbf`);
			writePbf(openOsm(fixturePath(name)), pbf, { locationsOnWays: true });

			expect(buildGraph(openOsm(pbf)).graph).toEqual(fixtureGraph(name));
		},
	);
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

	it('leaves out the segments to a node the extract lacks, and the zone whose boundary it holds only in part', () => {
		const { graph, report } = buildGraph(openOsm(fixturePath('edge-of-extract.osm')));

		expect(edges(graph)).toEqual(
			[
				['0,0.2 AAA', '0,0.4 AAA'],
				['0,0.8 AAA', '0,1.2 '],
			]
				.flatMap(([one, two]) => [`${one} → ${two}`, `${two} → ${one}`])
				.sort(),
		);
		expect([...graph.edgeSeconds].sort()).toEqual([1334, 1334, 2669, 2669]);
		expect(report.incompleteZones).toEqual(['BBB']);
	});

	it('keeps the rings of a zone that the extract holds whole, and leaves out a zone of none but holes', () => {
		const { graph, report } = buildGraph(openOsm(fixturePath('partial-zone.osm')));

		expect(edges(graph)).toEqual(
			[
				['0,0.2 AAA', '0,0.8 AAA'],
				['0,2.2 ', '0,2.8 '],
			]
				.flatMap(([one, two]) => [`${one} → ${two}`, `${two} → ${one}`])
				.sort(),
		);
		expect(report).toMatchObject({ zones: ['AAA'], partialZones: ['AAA'], incompleteZones: ['BBB'] });
	});

	it('marks the edges across a border that pass a barrier=border_control', () => {
		const graph = fixtureGraph('borders.osm');
		const marked = new Set(graph.borderControlEdges);

		expect(edges(graph, (edge) => marked.has(edge))).toEqual(
			[
				['0.2,0.9 AAA', '0.2,1.1 BBB'],
				['0.3,0.995 AAA', '0.3,1.1 BBB'],
				['0.3,1.9 BBB', '0.3,2.1 CCC'],
			]
				.flatMap(([one, two]) => [`${one} → ${two}`, `${two} → ${one}`])
				.sort(),
		);
	});
});

/** OSM ways with their locations, as `osmium add-locations-to-ways` writes them; each point is [lat, lon] in degrees. */
function locatedWays(...ways: { refs: number[]; points: [number, number][]; tags?: Record<string, string> }[]): OsmSource {
	return {
		read(visitor) {
			ways.forEach(({ refs, points, tags }, index) =>
				visitor.way?.({
					id: index + 1,
					refs,
					tags: tags ?? { highway: 'secondary' },
					locations: { lat: points.map(([lat]) => lat * 1e7), lon: points.map(([, lon]) => lon * 1e7) },
				}),
			);
		},
	};
}

describe('a loop of degree-2 nodes', () => {
	// A road from 0,0 to the loop's junction at 0,0.1; the loop goes round through 0.1,0.2, 0,0.3 and −0.1,0.2.
	const road = {
		refs: [1, 2],
		points: [
			[0, 0],
			[0, 0.1],
		] as [number, number][],
	};
	const loopSeconds = 4 * (15_725 / (60 / 3.6));

	it.each([
		[
			'one closed way',
			[
				{
					refs: [2, 3, 4, 5, 2],
					points: [
						[0, 0.1],
						[0.1, 0.2],
						[0, 0.3],
						[-0.1, 0.2],
						[0, 0.1],
					] as [number, number][],
				},
			],
		],
		[
			'two ways',
			[
				{
					refs: [2, 3, 4],
					points: [
						[0, 0.1],
						[0.1, 0.2],
						[0, 0.3],
					] as [number, number][],
				},
				{
					refs: [4, 5, 2],
					points: [
						[0, 0.3],
						[-0.1, 0.2],
						[0, 0.1],
					] as [number, number][],
				},
			],
		],
	])('made of %s keeps its edges both ways, none from a node to itself', (_, loop) => {
		const graph = buildGraph(locatedWays(road, ...loop)).graph;
		const loopEdges = edges(graph).filter((edge) => !edge.includes('0,0 '));

		// Two edges each way between the junction and one node of the loop.
		expect(loopEdges).toHaveLength(4);
		expect(loopEdges.every((edge) => edge.split(' → ')[0] !== edge.split(' → ')[1])).toBe(true);
		const seconds = [...graph.edgeSeconds].reduce((sum, value) => sum + value, 0);
		// The road (11.1 km) both ways and the loop (4 × 15.7 km) both ways, at 60 km/h, each edge rounded.
		expect(Math.abs(seconds - 2 * (11_119.5 / (60 / 3.6) + loopSeconds))).toBeLessThan(3);
	});
});

describe('a chain longer than an edge holds', () => {
	// Three ways end to end along the equator, 0°–8°–16°–24°E, a node every 0.5°: 2 669 km, 44.5 h at 60 km/h.
	const way = (from: number) => ({
		refs: Array.from({ length: 17 }, (_, index) => from * 2 + index + 1),
		points: Array.from({ length: 17 }, (_, index): [number, number] => [0, from + index / 2]),
	});

	it('is split into edges of at most MAX_EDGE_SECONDS at its nodes, keeping its driving time', () => {
		const graph = buildGraph(locatedWays(way(0), way(8), way(16))).graph;

		expect(graph.nodeLat.every((lat) => lat === 0)).toBe(true);
		expect([...graph.nodeLon].every((lon) => (lon / 1e7) % 0.5 === 0)).toBe(true);
		expect(graph.edgeSeconds.length).toBeGreaterThanOrEqual(6);
		expect(Math.max(...graph.edgeSeconds)).toBeLessThanOrEqual(MAX_EDGE_SECONDS);
		const seconds = [...graph.edgeSeconds].reduce((sum, value) => sum + value, 0);
		expect(Math.abs(seconds - 2 * (2_668_700 / (60 / 3.6)))).toBeLessThan(200);
	});
});

describe('an extract the size of a part of the world', () => {
	/**
	 * One road along the equator from 0° east, a node every 1e-7° (1.1 cm), 17 M nodes in all: more than a JS Map
	 * holds (2^24). Its ways of 1 001 nodes each share their ends, as `osmium add-locations-to-ways` writes them,
	 * and the node ids are past 2^32, as OSM's are.
	 */
	const longRoad: OsmSource = {
		read(visitor) {
			const nodesPerWay = 1000;
			for (let way = 0; way < 17_000; way++) {
				const first = way * nodesPerWay;
				const lon = Array.from({ length: nodesPerWay + 1 }, (_, index) => first + index);
				visitor.way?.({
					id: way + 1,
					refs: lon.map((offset) => 10_000_000_000 + offset),
					tags: { highway: 'secondary' },
					locations: { lat: lon.map(() => 0), lon },
				});
			}
		},
	};

	it('collapses a road of more nodes than a JS Map holds', { timeout: 120_000 }, () => {
		const graph = buildGraph(longRoad).graph;

		expect(edges(graph)).toEqual(['0,0  → 0,1.7 ', '0,1.7  → 0,0 ']);
		// 189.0 km at 60 km/h.
		expect([...graph.edgeSeconds]).toEqual([11342, 11342]);
	});
});

describe('the build report', () => {
	const report = (name: string, table: BorderTable) => buildGraph(openOsm(fixturePath(name)), table).report.borders;

	it('lists the pairs with passport control whose roads cross nowhere at a border crossing', () => {
		// chains.osm: one road across AAA–BBB, no checkpoint.
		expect(report('chains.osm', rules())).toEqual({ pairsWithoutCrossings: [{ pair: 'AAA–BBB', edges: 2 }], crossingsNotFound: [] });
	});

	it.each([
		['an open crossing of the table is on the road', rules({ crossings: [crossing('road', 0, 1, 'open')] })],
		['the pair is crossed freely', rules({ schengen: ['AAA', 'BBB'] })],
		['the pair is closed', rules({ pairs: [pair('closed')] })],
		['a country is closed for everyone', rules({ closedForEveryone: ['BBB'] })],
	])('lists no pair when %s', (_, table) => {
		expect(report('chains.osm', table).pairsWithoutCrossings).toEqual([]);
	});

	it('lists the open crossings of the table near no road across their border', () => {
		const table = rules({
			crossings: [crossing('road', 0, 1, 'open'), crossing('nowhere', 0.5, 1, 'open'), crossing('footpath', 0.6, 1, 'pedestrian_only')],
		});

		expect(report('chains.osm', table).crossingsNotFound).toEqual(['nowhere']);
	});

	it('lists no crossing of a border the graph does not have', () => {
		const table = rules({ crossings: [{ ...crossing('elsewhere', 0, 1, 'open'), pair: ['CCC', 'DDD'] }] });

		expect(report('chains.osm', table).crossingsNotFound).toEqual([]);
	});

	it('is not made with a border table that has problems', () => {
		expect(() => report('chains.osm', rules({ pairs: [{ ...pair('closed'), pair: ['BBB', 'AAA'] }] }))).toThrow('alphabetical order');
	});
});
