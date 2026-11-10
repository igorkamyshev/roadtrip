// The commands as a person runs them: `ring` writes GeoJSON, `build-graph` a graph file `ring` reads.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { decodeCities, encodeCities, parseCitiesFile } from '../src/cities-file.ts';
import { field, items } from 'engine/json';
import { fixturePath } from './fixture-graph.ts';

const command = (name: string, ...args: string[]) =>
	execFileSync(process.execPath, [fileURLToPath(new URL(`../src/cli/${name}.ts`, import.meta.url)), ...args], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});

/** The geometry of the one feature of the ring command's GeoJSON. */
function ringGeometry(output: string): unknown {
	const [feature] = items(field(JSON.parse(output), 'features'), 'the features');
	return field(feature, 'geometry');
}

const geonames = (name: string) => fixturePath(`geonames/${name}`);

/** The russian-names command as a process, which may fail. */
const russianNames = (...args: string[]) =>
	spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli/russian-names.ts', import.meta.url)), ...args], {
		encoding: 'utf8',
	});

/** The cities file a command wrote, its cities biggest first. */
const writtenCities = (path: string) => decodeCities(parseCitiesFile(JSON.parse(readFileSync(path, 'utf8'))));

describe('the ring command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	it('writes the ring of an extract as GeoJSON', () => {
		const geojson: unknown = JSON.parse(command('ring', fixturePath('straight-road.osm'), '--lat', '0', '--lon', '0', '--hours', '2'));

		expect(geojson).toMatchObject({
			type: 'FeatureCollection',
			features: [{ type: 'Feature', geometry: { type: 'MultiPolygon' }, properties: { outcome: 'ring', startCountry: 'AAA', hours: 2 } }],
		});
	});

	it('takes a negative coordinate after a space, as after =', () => {
		// 11.1 km west of the road's west end.
		const geojson: unknown = JSON.parse(command('ring', fixturePath('straight-road.osm'), '--lat', '0', '--lon', '-0.1', '--hours', '2'));

		expect(geojson).toMatchObject({ features: [{ properties: { outcome: 'ring', origin: { lat: 0, lon: -0.1 } } }] });
	});

	it('reads a graph file the build-graph command wrote, for the same ring', () => {
		const graph = join(directory, 'straight-road.graph');
		command('build-graph', fixturePath('straight-road.osm'), graph);

		const fromGraph = ringGeometry(command('ring', graph, '--lat', '0', '--lon', '0', '--hours', '2'));
		const fromExtract = ringGeometry(command('ring', fixturePath('straight-road.osm'), '--lat', '0', '--lon', '0', '--hours', '2'));
		expect(fromGraph).toEqual(fromExtract);
	});

	it('takes the closed countries', () => {
		// Road 3 of borders.osm, from its west end, stops before BBB (the fixture's header).
		const geojson: unknown = JSON.parse(
			command('ring', fixturePath('borders.osm'), '--lat', '0.3', '--lon', '0.5', '--hours', '12', '--closed', 'BBB'),
		);

		expect(geojson).toMatchObject({ features: [{ properties: { outcome: 'empty', maxHours: 2, closedCountries: ['BBB'] } }] });
	});
});

describe('the build-graph command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	it('reports the pairs with passport control and no border crossing on their roads', () => {
		const run = spawnSync(
			process.execPath,
			[fileURLToPath(new URL('../src/cli/build-graph.ts', import.meta.url)), fixturePath('chains.osm'), join(directory, 'chains.graph')],
			{
				encoding: 'utf8',
			},
		);

		expect(run.status).toBe(0);
		expect(run.stderr).toContain('pairs with passport control and no border crossing on their roads');
		expect(run.stderr).toContain('AAA–BBB (2 edges)');
	});

	it('writes the build report as Markdown with --report, for the summary of the world build', () => {
		const report = join(directory, 'report.md');

		command('build-graph', fixturePath('chains.osm'), join(directory, 'chains.graph'), '--report', report);

		const markdown = readFileSync(report, 'utf8');
		expect(markdown).toContain('Пары с паспортным контролем без пунктов пропуска');
		expect(markdown).toContain('| AAA–BBB | 2 |');
		expect(markdown).toMatch(/4 дороги/u);
		expect(markdown).toMatch(/6 узлов, 10 рёбер/u);
	});

	it('reports the zones left out and the zones kept without some of their rings', () => {
		const report = join(directory, 'partial-zone.md');

		const run = spawnSync(
			process.execPath,
			[
				fileURLToPath(new URL('../src/cli/build-graph.ts', import.meta.url)),
				fixturePath('partial-zone.osm'),
				join(directory, 'partial.graph'),
				'--report',
				report,
			],
			{ encoding: 'utf8' },
		);

		expect(run.stderr).toContain('kept without the rings the extract holds only in part: AAA');
		expect(run.stderr).toContain('left out, as the extract holds no whole ring of them but holes: BBB');
		const markdown = readFileSync(report, 'utf8');
		expect(markdown).toContain('без колец, которые выгрузка держит не целиком: AAA');
		expect(markdown).toContain('BBB');
	});

	it('writes the zone outlines with --outlines', () => {
		const outlines = join(directory, 'zones.json');

		command('build-graph', fixturePath('zones.osm'), join(directory, 'zones.graph'), '--outlines', outlines);

		const written: unknown = JSON.parse(readFileSync(outlines, 'utf8'));
		expect(written).toMatchObject({ type: 'FeatureCollection' });
		expect(items(field(written, 'features'), 'the features').map((feature) => field(field(feature, 'properties'), 'zone'))).toContain('NX');
	});
});

describe('the build-cities command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	it("writes the cities file of GeoNames' files, the zones by the polygons of a graph, and adds the parts of a city and the names the table lacks to the report", () => {
		const out = join(directory, 'cities.json');
		// What build-graph wrote of the report before.
		const report = join(directory, 'report.md');
		writeFileSync(report, '## Граф дорог\n');

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
				'--report',
				report,
			],
			{ encoding: 'utf8' },
		);

		expect(run.status).toBe(0);
		// The fixtures' cities in the squares of zones.osm: Kyrenia and Famagusta in Northern Cyprus. Not Engomi, 1.1 km
		// from Nicosia, within its limits of 4.0 km and an eleventh of it: a part of the city.
		expect(writtenCities(out)).toEqual([
			[146268, 'Никосия', 'Nicosia', 0.5, 3.5, 200_452, 'CYP'],
			[786714, 'Приштина', 'Pristina', 0.5, 0.5, 161_751, 'RKS'],
			[617239, 'Тирасполь', 'Tiraspol', 0.5, 7.5, 157_000, 'MDA'],
			[146384, 'Лимасол', 'Limassol', 0.3, 3.2, 154_000, 'CYP'],
			[146617, '', 'Famagusta', 0.7, 2.7, 42_526, 'NX'],
			[146412, 'Кирения', 'Kyrenia', 0.5, 2.5, 26_701, 'NX'],
			// Outside every polygon of zones.osm, in its GeoNames country.
			[3_430_415, '', 'Nogoyá', -32.393, -59.79, 20_442, 'ARG'],
		]);
		expect(run.stderr).toContain('7 cities of 10 lines');
		expect(run.stderr).toContain('parts of a city, left out: 1; the biggest: 146500 Engomi (Nicosia, 1.1 km)');
		expect(readFileSync(report, 'utf8')).toBe(
			[
				'## Граф дорог',
				'',
				'## Части города',
				'',
				'Мест, которые стали частями города и не вошли в файл городов: 1.',
				'',
				'Все они:',
				'',
				'| Место | Жителей | Город | Расстояние, км |',
				'| --- | --- | --- | --- |',
				'| Engomi (146500) | 18\u00A0000 | Nicosia | 1,1 |',
				'',
				'## Русские названия',
				'',
				'Городов без русского названия, которых нет в таблице `data/russian-names.tsv`: 1. Самые большие: Famagusta (146617).',
				'',
			].join('\n'),
		);
		expect(run.stderr).toContain('Russian names: 5 from GeoNames, 0 from Wikidata, 2 without');
		// Nogoyá's is in the shipped table, which the deploy puts in.
		expect(run.stderr).toContain('without a Russian name and not in the table of Russian names: 1; the biggest: 146617 Famagusta');
		expect(run.stderr).toMatch(/MB in brotli/u);
	});

	it('takes the cities of the countries given', () => {
		const out = join(directory, 'cyprus.json');

		command(
			'build-cities',
			fixturePath('zones.osm'),
			out,
			'--cities',
			geonames('cities1000.txt'),
			'--names',
			geonames('alternateNamesV2.txt'),
			'--countries',
			'CY',
			'--no-wikidata',
		);

		expect(writtenCities(out).map(([, , local]) => local)).toEqual(['Nicosia', 'Limassol', 'Famagusta', 'Kyrenia']);
	});
});

describe('the russian-names command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	/**
	 * A cities file as R2 holds it: Marondera's Russian name broken, Nogoyá's missing, Belgrade's GeoNames'. Indented,
	 * so that a command that rewrites it at all changes its bytes.
	 */
	const fetchedCities = (name: string) => {
		const path = join(directory, name);
		writeFileSync(
			path,
			JSON.stringify(
				encodeCities([
					[792_680, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
					[886_990, 'Маронdera', 'Marondera', -18.185, 31.552, 61_998, 'ZWE'],
					[3_430_415, '', 'Nogoyá', -32.393, -59.79, 20_442, 'ARG'],
				]),
				undefined,
				'\t',
			),
		);
		return path;
	};
	const table = (name: string, lines: readonly string[]) => {
		const path = join(directory, name);
		writeFileSync(path, `${lines.join('\n')}\n`);
		return path;
	};

	it("puts the table's Russian names over the file's, and leaves the other cities as they were", () => {
		const cities = fetchedCities('cities.json');
		const names = table('names.tsv', [
			'geonameid\tname\tru',
			'99347\tAl Hillah\tЭль-Хилла',
			'886990\tMarondera\tМарондера',
			'3430415\tNogoyá\tНогоя',
		]);

		const run = russianNames(cities, '--names', names);

		expect(run.status).toBe(0);
		expect(writtenCities(cities)).toEqual([
			[792_680, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
			[886_990, 'Марондера', 'Marondera', -18.185, 31.552, 61_998, 'ZWE'],
			[3_430_415, 'Ногоя', 'Nogoyá', -32.393, -59.79, 20_442, 'ARG'],
		]);
		expect(run.stderr).toContain('2 cities named; ids of the table not in the file: 1');
	});

	it.each([
		['a Latin name', ['geonameid\tname\tru', '886990\tMarondera\tМарондера', '3430415\tNogoyá\tNogoyá'], 3],
		['a line of two columns', ['geonameid\tname\tru', '886990\tМарондера'], 2],
		['a repeated id', ['geonameid\tname\tru', '886990\tMarondera\tМарондера', '886990\tMarondera\tМаррондера'], 3],
		['another header', ['id\tname\tru', '886990\tMarondera\tМарондера'], 1],
	])('fails on a table with %s, naming its line, and leaves the cities file as it was', (_, lines, line) => {
		const cities = fetchedCities('untouched.json');
		const before = readFileSync(cities);

		const run = russianNames(cities, '--names', table('bad.tsv', lines));

		expect(run.status).not.toBe(0);
		expect(run.stderr).toContain(`line ${line}`);
		expect(readFileSync(cities)).toEqual(before);
	});

	it('reads the shipped table without --names', () => {
		const cities = fetchedCities('shipped.json');

		const run = russianNames(cities);

		expect(run.status).toBe(0);
		expect(writtenCities(cities).map(([, ru]) => ru)).toEqual(['Белград', 'Марондера', 'Ногоя']);
	});
});
