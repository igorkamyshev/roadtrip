// The commands as a person runs them: `ring` writes GeoJSON, `build-graph` a graph file `ring` reads.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

	it('writes the zone outlines with --outlines', () => {
		const outlines = join(directory, 'zones.json');

		command('build-graph', fixturePath('zones.osm'), join(directory, 'zones.graph'), '--outlines', outlines);

		const written = JSON.parse(readFileSync(outlines, 'utf8')) as { type: string; features: { properties: { zone: string } }[] };
		expect(written.type).toBe('FeatureCollection');
		expect(written.features.map(({ properties }) => properties.zone)).toContain('NX');
	});
});

describe('the build-cities command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => rmSync(directory, { recursive: true }));
	const geonames = (name: string) => fixturePath(`geonames/${name}`);

	it("writes the cities file of GeoNames' files, the zones by the polygons of a graph", () => {
		const out = join(directory, 'cities.json');

		const run = spawnSync(
			process.execPath,
			[
				fileURLToPath(new URL('../src/cli/build-cities.ts', import.meta.url)),
				fixturePath('zones.osm'),
				out,
				'--cities',
				geonames('cities1000.txt'),
				'--names',
				geonames('alternateNamesV2.txt'),
				'--no-wikidata',
			],
			{ encoding: 'utf8' },
		);

		expect(run.status).toBe(0);
		// The fixtures' cities in the squares of zones.osm: Kyrenia and Famagusta in Northern Cyprus.
		expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({
			format: 1,
			cities: [
				[146268, 'Никосия', 'Nicosia', 0.5, 3.5, 200_452, 'CYP'],
				[786714, 'Приштина', 'Pristina', 0.5, 0.5, 161_751, 'RKS'],
				[617239, 'Тирасполь', 'Tiraspol', 0.5, 7.5, 157_000, 'MDA'],
				[146384, 'Лимасол', 'Limassol', 0.3, 3.2, 154_000, 'CYP'],
				[146617, '', 'Famagusta', 0.7, 2.7, 42_526, 'NX'],
				[146412, 'Кирения', 'Kyrenia', 0.5, 2.5, 26_701, 'NX'],
			],
		});
		expect(run.stderr).toContain('6 cities of 8 lines');
		expect(run.stderr).toContain('Russian names: 5 from GeoNames, 0 from Wikidata, 1 without');
		expect(run.stderr).toMatch(/MB in brotli/u);
	});

	it('takes the cities of the countries given', () => {
		const out = join(directory, 'cyprus.json');

		command('build-cities', fixturePath('zones.osm'), out, '--cities', geonames('cities1000.txt'), '--names', geonames('alternateNamesV2.txt'), '--countries', 'CY', '--no-wikidata');

		const written = JSON.parse(readFileSync(out, 'utf8')) as { cities: [number, string, string][] };
		expect(written.cities.map(([, , local]) => local)).toEqual(['Nicosia', 'Limassol', 'Famagusta', 'Kyrenia']);
	});
});
