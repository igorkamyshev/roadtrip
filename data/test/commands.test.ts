// The commands as a person runs them: `ring` writes GeoJSON, `build-graph` a graph file `ring` reads.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { type CityRow, decodeCities, encodeCities, parseCitiesFile } from '../src/cities-file.ts';
import { decodePlaceOutlines, decodePlaces, encodePlaces, parsePlaceOutlinesFile, parsePlacesFile } from '../src/places-file.ts';
import { field, items } from 'engine/json';
import { fixturePath } from './fixture-graph.ts';
import { PLACES_SITELINKS, sitelinksDump } from './sitelinks-dump.ts';

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

/** The exclude-places command as a process, which may fail. */
const excludePlaces = (...args: string[]) =>
	spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli/exclude-places.ts', import.meta.url)), ...args], {
		encoding: 'utf8',
	});

/** The build-places command as a process, which may fail. */
const buildPlaces = (...args: string[]) =>
	spawnSync(process.execPath, [fileURLToPath(new URL('../src/cli/build-places.ts', import.meta.url)), ...args], { encoding: 'utf8' });

/** The cities file a command wrote, its cities biggest first. */
const writtenCities = (path: string) => decodeCities(parseCitiesFile(JSON.parse(readFileSync(path, 'utf8'))));

/** The places a command wrote, the most famous first, each its Q-id and names. */
const writtenPlaces = (path: string) =>
	decodePlaces(parsePlacesFile(JSON.parse(readFileSync(path, 'utf8')))).map(({ qid, ru, local }) => [qid, ru, local]);

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

describe('the build-places command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	/** The cities file of the cities of places.osm's header. */
	const citiesFile = (name: string, cities: readonly CityRow[]) => {
		const path = join(directory, name);
		writeFileSync(path, JSON.stringify(encodeCities(cities)));
		return path;
	};
	/** The dump of the sitelinks, gzipped as Wikimedia serves it. */
	const dump = (name: string, sitelinks: Parameters<typeof sitelinksDump>[0]) => {
		const path = join(directory, name);
		writeFileSync(path, gzipSync(`${sitelinksDump(sitelinks).join('\n')}\n`));
		return path;
	};

	it('writes the places file of the places, the graph, the cities and the sitelinks, and adds the places to the report', () => {
		const out = join(directory, 'places.json');
		const report = join(directory, 'report.md');
		writeFileSync(report, '## Граф дорог\n');

		const run = buildPlaces(
			fixturePath('places.osm'),
			fixturePath('places.osm'),
			citiesFile('cities.json', [
				[1, '', 'Big', 0.7, 0.93, 1_000_000, 'AAA'],
				[2, '', 'Small', 0.25, 0.95, 250_000, 'AAA'],
			]),
			out,
			'--sitelinks',
			dump('sitelinks.sql.gz', PLACES_SITELINKS),
			'--no-wikidata',
			'--report',
			report,
		);

		expect(run.status).toBe(0);
		// Without Wikidata no place of worship is a monastery, and the names are ruwiki's titles and OSM's.
		expect(
			decodePlaces(parsePlacesFile(JSON.parse(readFileSync(out, 'utf8')))).map(({ qid, ru, local, type }) => [qid, ru, local, type]),
		).toEqual([
			[1001, 'Пограничный водопад', 'Granični vodopad', 'waterfall'],
			[1010, 'Заповедник Би', '', 'national-park'],
			[1008, '', '', 'ruins'],
			[1012, '', 'Jezero Le', 'lake'],
			[1005, 'Каштел', '', 'castle'],
			[1004, "Д'Арк", '', 'mountain'],
		]);
		expect(run.stderr).toContain('6 places of 12 objects');
		expect(run.stderr).toContain(
			'left out: 1 of fewer than 10 sitelinks, 0 without a whole outline, 0 over 2000 km², 1 within a city, 1 with no road within 10 km, ' +
				'2 places of worship that are no monastery, 0 out by the table of exclusions of places',
		);
		// Without Wikidata, no doubt of an item.
		expect(run.stderr).toContain('in doubt and not in the table of exclusions of places: 0 (class 0, disambiguation 0, settlement 0)');
		expect(run.stderr).toContain(
			'without a Russian name and not in the table of Russian names of places: 2; the most famous: Q1008, Q1012 Jezero Le',
		);
		expect(run.stderr).toMatch(/wrote .*places\.json: 0\.00 MB, 0\.00 MB in brotli of 0\.60/u);
		expect(readFileSync(report, 'utf8')).toBe(
			[
				'## Граф дорог',
				'',
				'## Места',
				'',
				'В файле мест 6 мест, 0,00 МБ в brotli при бюджете 0,6 МБ.',
				'',
				'Не вошли: меньше 10 сайтлинков — 1, без целого контура — 0, больше 2000 км² — 0, в пределах города — 1, без дороги ближе 10 км — 1, ' +
					'храмы, которые Wikidata не называет монастырём, — 2, убраны таблицей исключений — 0.',
				'',
				'Клеток контуров: 2, в них 0 мест контуром и 6 мест радиусом, 0,00 МБ.',
				'',
				'Мест без русского названия, которых нет в таблице `data/place-russian-names.tsv`: 2. Самые известные: Q1008, Jezero Le (Q1012).',
				'',
				'Кандидатов в исключения без решения в таблице `data/place-exclusions.tsv`: 0 (класс — 0, страница неоднозначности — 0, селение — 0).',
				'',
			].join('\n'),
		);
	});

	it('writes the cells of the outlines beside the places file, in place of those there were, and counts them', () => {
		const out = join(directory, 'outlines', 'places.json');
		mkdirSync(join(directory, 'outlines', 'place-outlines'), { recursive: true });
		writeFileSync(join(directory, 'outlines', 'place-outlines', '9_9.json'), '{}');

		const run = buildPlaces(
			fixturePath('place-outlines.osm'),
			fixturePath('place-outlines.osm'),
			citiesFile('outline-cities.json', [[1, '', 'Big', 0.8, 0.3, 1_000_000, 'AAA']]),
			out,
			'--sitelinks',
			dump(
				'outline-sitelinks.sql.gz',
				Object.fromEntries([2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008].map((qid) => [qid, { count: 20 }])),
			),
			'--no-wikidata',
		);

		expect(run.status).toBe(0);
		expect(readdirSync(join(directory, 'outlines', 'place-outlines')).toSorted()).toEqual(['0_0.json', '0_1.json', '1_1.json']);
		expect(
			decodePlaceOutlines(
				parsePlaceOutlinesFile(JSON.parse(readFileSync(join(directory, 'outlines', 'place-outlines', '1_1.json'), 'utf8'))),
			),
		).toEqual({ outlines: [{ qid: 2007, rings: [[0.95, 1.05, 0.95, 1.1, 0.995, 1.1, 0.995, 1.05]] }], radii: [] });
		expect(run.stderr).toContain('1 without a whole outline, 1 over 2000 km²');
		expect(run.stderr).toMatch(/wrote 3 cells of the outlines of 4 places and the radii of 1, 0\.00 MB, to .*place-outlines/u);
	});

	// Brotli of quality 11 takes seconds over 0.7 MB.
	it('fails over the budget of 0.6 MB in brotli, printing the size, and writes no file', { timeout: 30_000 }, () => {
		// 8 000 peaks of random names of 120 of 64 letters, digits and signs, 90 bytes each in brotli: 0.72 MB.
		const peaks = 8000;
		let seed = 1;
		const random = () => {
			seed = (seed * 48_271) % 2_147_483_647;
			return seed / 2_147_483_647;
		};
		const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
		const nodes = Array.from({ length: peaks }, (_, index) => {
			const name = Array.from({ length: 120 }, () => letters[Math.floor(random() * letters.length)]).join('');
			return `<node id="${10_000 + index}" lat="${(0.2 + (0.6 * index) / peaks).toFixed(6)}" lon="0.88"><tag k="natural" v="peak"/><tag k="name" v="${name}"/><tag k="wikidata" v="Q${10_000 + index}"/></node>`;
		});
		const osm = join(directory, 'many-peaks.osm');
		writeFileSync(osm, readFileSync(fixturePath('places.osm'), 'utf8').replace('<way id="1">', `${nodes.join('\n')}\n<way id="1">`));
		const out = join(directory, 'too-big.json');

		const run = buildPlaces(
			osm,
			fixturePath('places.osm'),
			citiesFile('no-cities.json', []),
			out,
			'--sitelinks',
			dump('many-sitelinks.sql.gz', Object.fromEntries(Array.from({ length: peaks }, (_, index) => [10_000 + index, { count: 10 }]))),
			'--no-wikidata',
		);

		expect(run.status).not.toBe(0);
		expect(run.stderr).toMatch(/0\.7\d MB in brotli, over the budget of 0\.60 MB/u);
		expect(existsSync(out)).toBe(false);
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

	// The wrong way these catch: a command that writes the cities file before it has checked the whole table.
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

	/** A places file as R2 holds it: Garda with Wikidata's Russian label, Lovćen without one. Indented, as `fetchedCities`. */
	const fetchedPlaces = (name: string) => {
		const path = join(directory, name);
		writeFileSync(
			path,
			JSON.stringify(
				encodePlaces([
					{
						qid: 6386,
						ru: 'Гарда',
						local: 'Lake Garda',
						lat: 45.65,
						lon: 10.667,
						sitelinks: 90,
						type: 'lake',
						access: [{ lat: 45.6, lon: 10.6, zone: 'ITA' }],
					},
					{
						qid: 1_430_120,
						ru: '',
						local: 'Lovćen',
						lat: 42.4,
						lon: 18.817,
						sitelinks: 40,
						type: 'national-park',
						access: [{ lat: 42.399, lon: 18.81, zone: 'MNE' }],
					},
				]),
				undefined,
				'\t',
			),
		);
		return path;
	};
	it("puts the places table's Russian names over the places file's by Q-id", () => {
		const places = fetchedPlaces('places.json');
		const names = table('place-names.tsv', [
			'qid\tname\tru',
			'Q6386\tLake Garda\tОзеро Гарда',
			'Q1430120\tLovćen\tЛовчен',
			'Q42\tDouglas Adams\tДуглас Адамс',
		]);

		const run = russianNames(places, '--place-names', names);

		expect(run.status).toBe(0);
		expect(writtenPlaces(places)).toEqual([
			[6386, 'Озеро Гарда', 'Lake Garda'],
			[1_430_120, 'Ловчен', 'Lovćen'],
		]);
		expect(run.stderr).toContain('2 places named; Q-ids of the table not in the file: 1');
	});

	it.each([
		['a key without Q', ['qid\tname\tru', 'Q6386\tLake Garda\tОзеро Гарда', '1430120\tLovćen\tЛовчен'], 3],
		['a line of two columns', ['qid\tname\tru', 'Q6386\tОзеро Гарда'], 2],
		['a repeated Q-id', ['qid\tname\tru', 'Q6386\tLake Garda\tОзеро Гарда', 'Q6386\tLake Garda\tГарда'], 3],
		["the cities' header", ['geonameid\tname\tru', 'Q6386\tLake Garda\tОзеро Гарда'], 1],
	])('fails on a places table with %s, naming its line, and leaves the places file as it was', (_, lines, line) => {
		const places = fetchedPlaces('untouched-places.json');
		const before = readFileSync(places);

		const run = russianNames(places, '--place-names', table('bad-places.tsv', lines));

		expect(run.status).not.toBe(0);
		expect(run.stderr).toContain(`line ${line}`);
		expect(readFileSync(places)).toEqual(before);
	});

	it('names the cities of a directory without a places file, as fetch-dataset leaves one of a dataset without places', () => {
		const fetched = mkdtempSync(join(directory, 'without-places-'));
		const cities = fetchedCities('without-places-cities.json');
		writeFileSync(join(fetched, 'cities.json'), readFileSync(cities));

		const run = russianNames(fetched);

		expect(run.status).toBe(0);
		expect(writtenCities(join(fetched, 'cities.json')).map(([, ru]) => ru)).toEqual(['Белград', 'Марондера', 'Ногоя']);
		expect(existsSync(join(fetched, 'places.json'))).toBe(false);
		expect(run.stderr).toContain('no places file');
	});

	it('names the cities and the places of a directory, each by its own table', () => {
		const fetched = mkdtempSync(join(directory, 'with-places-'));
		writeFileSync(join(fetched, 'cities.json'), readFileSync(fetchedCities('with-places-cities.json')));
		writeFileSync(join(fetched, 'places.json'), readFileSync(fetchedPlaces('with-places-places.json')));

		const run = russianNames(fetched, '--place-names', table('directory-places.tsv', ['qid\tname\tru', 'Q1430120\tLovćen\tЛовчен']));

		expect(run.status).toBe(0);
		expect(writtenCities(join(fetched, 'cities.json')).map(([, ru]) => ru)).toEqual(['Белград', 'Марондера', 'Ногоя']);
		expect(writtenPlaces(join(fetched, 'places.json'))).toEqual([
			[6386, 'Гарда', 'Lake Garda'],
			[1_430_120, 'Ловчен', 'Lovćen'],
		]);
		expect(run.stderr).toContain('2 cities named');
		expect(run.stderr).toContain('1 places named');
	});
});

describe('the exclude-places command', () => {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-commands-'));
	afterAll(() => {
		rmSync(directory, { recursive: true });
	});

	/**
	 * A places file as R2 holds it: Lake Garda, the ruins of Calstock whose item is the village (Q744317, between the
	 * two by Q-id) and Lovćen. Indented, so that a command that rewrites it at all changes its bytes.
	 */
	const fetchedPlaces = (name: string) => {
		const path = join(directory, name);
		const access = [{ lat: 45.6, lon: 10.6, zone: 'ITA' }];
		writeFileSync(
			path,
			JSON.stringify(
				encodePlaces([
					{ qid: 6386, ru: 'Гарда', local: 'Lake Garda', lat: 45.65, lon: 10.667, sitelinks: 90, type: 'lake', access },
					{ qid: 744_317, ru: 'Калсток', local: 'Calstock', lat: 50.497, lon: -4.21, sitelinks: 25, type: 'ruins', access },
					{ qid: 1_430_120, ru: '', local: 'Lovćen', lat: 42.4, lon: 18.817, sitelinks: 40, type: 'national-park', access },
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

	it('takes the places the table puts out from the places file, keeps the others by their Q-ids, and counts the out Q-ids the file lacks', () => {
		const places = fetchedPlaces('places.json');
		const exclusions = table('exclusions.tsv', [
			'qid\tname\tdecision',
			'Q6386\tLake Garda\tkeep',
			'Q59772\tlime kiln\tout',
			'Q744317\tCalstock\tout',
		]);

		const run = excludePlaces(places, '--table', exclusions);

		expect(run.status).toBe(0);
		// The wrong way this catches: a command that drops Calstock's row and leaves Lovćen's difference from it.
		expect(writtenPlaces(places)).toEqual([
			[6386, 'Гарда', 'Lake Garda'],
			[1_430_120, '', 'Lovćen'],
		]);
		expect(run.stderr).toContain('1 places taken out; out Q-ids of the table not in the file: 1');
	});

	// The wrong way these catch: a command that writes the places file before it has checked the whole table.
	it.each([
		['a decision of neither out nor keep', ['qid\tname\tdecision', 'Q6386\tLake Garda\tkeep', 'Q744317\tCalstock\tmaybe'], 3],
		['a key without Q', ['qid\tname\tdecision', '744317\tCalstock\tout'], 2],
		['a repeated Q-id', ['qid\tname\tdecision', 'Q744317\tCalstock\tout', 'Q744317\tCalstock\tkeep'], 3],
		["the Russian names' header", ['qid\tname\tru', 'Q744317\tCalstock\tout'], 1],
	])('fails on a table with %s, naming its line, and leaves the places file as it was', (_, lines, line) => {
		const places = fetchedPlaces('untouched.json');
		const before = readFileSync(places);

		const run = excludePlaces(places, '--table', table('bad.tsv', lines));

		expect(run.status).not.toBe(0);
		expect(run.stderr).toContain(`line ${line}`);
		expect(readFileSync(places)).toEqual(before);
	});

	it('reads the shipped table without --table: Calstock is out of it', () => {
		const places = fetchedPlaces('shipped.json');

		const run = excludePlaces(places);

		expect(run.status).toBe(0);
		expect(writtenPlaces(places).map(([qid]) => qid)).toEqual([6386, 1_430_120]);
	});

	it("takes the places out of a directory's places file, and does nothing in one without, as fetch-dataset leaves one of a dataset without places", () => {
		const withPlaces = mkdtempSync(join(directory, 'with-places-'));
		writeFileSync(join(withPlaces, 'places.json'), readFileSync(fetchedPlaces('directory-places.json')));
		const withoutPlaces = mkdtempSync(join(directory, 'without-places-'));
		const exclusions = table('directory.tsv', ['qid\tname\tdecision', 'Q744317\tCalstock\tout']);

		const run = excludePlaces(withPlaces, withoutPlaces, '--table', exclusions);

		expect(run.status).toBe(0);
		expect(writtenPlaces(join(withPlaces, 'places.json')).map(([qid]) => qid)).toEqual([6386, 1_430_120]);
		expect(readdirSync(withoutPlaces)).toEqual([]);
		expect(run.stderr).toContain('no places file');
	});
});
