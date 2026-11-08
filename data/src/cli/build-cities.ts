// Builds the cities file (spec «Набор данных», «Файл городов»): GeoNames' cities from 15 000 people with their
// Russian names (GeoNames, else Wikidata) and their zones by the polygons of a graph, as JSON (a static asset of the
// Worker, `/data/cities.json`). It prints what it did to stderr.
//
//   pnpm --filter data build-cities <graph file | extract | URL> <out.json>
//     [--cities <cities1000.zip | .txt | URL>] [--names <alternateNamesV2.zip | .txt | URL>,…]
//     [--countries <alpha-2>,…] [--no-wikidata]
//
// By default it downloads GeoNames' dumps: cities1000.zip and alternateNamesV2.zip (205 MB), or with --countries
// only those countries' cities and their files of alternate names (alternatenames/<alpha-2>.zip), for a region.
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { brotliCompressSync } from 'node:zlib';
import { encodeCities } from '../cities-file.ts';
import { buildCities } from '../cities.ts';
import { wikidataRussianLabels } from '../wikidata.ts';
import { fileLines, loadGraph, log, seconds, userPath, withLocalFile } from './input.ts';

const DUMP = 'https://download.geonames.org/export/dump';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		cities: { type: 'string', default: `${DUMP}/cities1000.zip` },
		names: { type: 'string' },
		countries: { type: 'string' },
		'no-wikidata': { type: 'boolean', default: false },
	},
});
const [graphFile, out] = positionals;
if (graphFile === undefined || out === undefined) {
	log(
		'usage: pnpm --filter data build-cities <graph file | extract | URL> <out.json> [--cities <cities1000.zip | .txt | URL>] ' +
			'[--names <alternateNamesV2.zip | .txt | URL>,…] [--countries <alpha-2>,…] [--no-wikidata]',
	);
	process.exit(2);
}
const countries =
	values.countries === undefined ? undefined : new Set(values.countries.split(',').map((code) => code.trim().toUpperCase()));
const names =
	values.names?.split(',') ??
	(countries === undefined ? [`${DUMP}/alternateNamesV2.zip`] : [...countries].map((code) => `${DUMP}/alternatenames/${code}.zip`));

const { graph } = await withLocalFile(graphFile, loadGraph);
const started = performance.now();
const { cities, report } = await buildCities({
	cities: ofCountries(fileLines(values.cities)),
	alternateNames: concat(names.map((name) => () => fileLines(name))),
	wikidataLabels: values['no-wikidata']
		? async () => new Map()
		: (ids) => {
				log(`Wikidata: asking for the Russian labels of ${ids.length} cities`);
				return wikidataRussianLabels(ids, { fetch, sleep, log });
			},
	graph,
});
const json = JSON.stringify(encodeCities(cities));
writeFileSync(userPath(out), json);

log(
	`${report.cities} cities of ${report.read} lines of ${values.cities}${countries === undefined ? '' : ` in ${[...countries].join(', ')}`}, in ${seconds(started)}`,
);
log(
	`Russian names: ${report.russianFromGeoNames} from GeoNames, ${report.russianFromWikidata} from Wikidata, ${report.withoutRussian} without`,
);
log(`zones: ${report.zoneByPolygon} by the graph's polygons, ${report.zoneByCountry} outside every polygon by their GeoNames country`);
if (report.withoutZone.length > 0) {
	log(`left out, outside every polygon and in a country that is no zone: ${report.withoutZone.join('; ')}`);
}
log(`wrote ${out}: ${(json.length / 1e6).toFixed(2)} MB, ${(brotliCompressSync(json).length / 1e6).toFixed(2)} MB in brotli`);

/** The lines of cities1000 of the countries asked for (its 9th column), or all of them. */
async function* ofCountries(lines: AsyncIterable<string>): AsyncGenerator<string> {
	for await (const line of lines) {
		if (countries === undefined || countries.has(line.split('\t', 9)[8] ?? '')) {
			yield line;
		}
	}
}

/** The lines of several files, one after another, each opened only when the one before it is read. */
async function* concat(files: readonly (() => AsyncIterable<string>)[]): AsyncGenerator<string> {
	for (const lines of files) {
		yield* lines();
	}
}
