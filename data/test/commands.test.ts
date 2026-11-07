// The commands as a person runs them: `ring` writes GeoJSON, `build-graph` a graph file `ring` reads.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { fixturePath } from './fixture-graph.ts';

const command = (name: string, ...args: string[]) =>
	execFileSync(process.execPath, [fileURLToPath(new URL(`../src/cli/${name}.ts`, import.meta.url)), ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

describe('the ring command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => rmSync(directory, { recursive: true }));

	it('writes the ring of an extract as GeoJSON', () => {
		const geojson = JSON.parse(command('ring', fixturePath('straight-road.osm'), '--lat', '0', '--lon', '0', '--hours', '2'));

		expect(geojson).toMatchObject({
			type: 'FeatureCollection',
			features: [{ type: 'Feature', geometry: { type: 'MultiPolygon' }, properties: { outcome: 'ring', startCountry: 'AAA', hours: 2 } }],
		});
	});

	it('reads a graph file the build-graph command wrote, for the same ring', () => {
		const graph = join(directory, 'straight-road.graph');
		command('build-graph', fixturePath('straight-road.osm'), graph);

		const fromGraph = JSON.parse(command('ring', graph, '--lat', '0', '--lon', '0', '--hours', '2'));
		const fromExtract = JSON.parse(command('ring', fixturePath('straight-road.osm'), '--lat', '0', '--lon', '0', '--hours', '2'));
		expect(fromGraph.features[0].geometry).toEqual(fromExtract.features[0].geometry);
	});

	it('takes the closed countries', () => {
		// Road 3 of borders.osm, from its west end, stops before BBB (the fixture's header).
		const geojson = JSON.parse(command('ring', fixturePath('borders.osm'), '--lat', '0.3', '--lon', '0.5', '--hours', '12', '--closed', 'BBB'));

		expect(geojson.features[0].properties).toMatchObject({ outcome: 'empty', maxHours: 2, closedCountries: ['BBB'] });
	});
});

describe('the build-graph command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => rmSync(directory, { recursive: true }));

	it('reports the pairs with passport control and no border crossing on their roads', () => {
		const run = spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli/build-graph.ts', import.meta.url)), fixturePath('chains.osm'), join(directory, 'chains.graph')], {
			encoding: 'utf8',
		});

		expect(run.status).toBe(0);
		expect(run.stderr).toContain('pairs with passport control and no border crossing on their roads');
		expect(run.stderr).toContain('AAA–BBB (2 edges)');
	});
});
