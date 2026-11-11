// Builds the places file (spec #154 «Сборка мест», amendment «Набор данных» of spec #20): the objects of OSM with a
// place's tags and wikidata=, from MIN_SITELINKS sitelinks of Wikidata's dump, out of the cities' limits and with access points on
// the graph's roads, named by Wikidata's labels (asked of the Query Service) and ruwiki's titles, as JSON (a static
// asset of the Worker, `/data/places.json`), and the cells of their outlines beside it, in `place-outlines/` in place
// of those there were (`/data/place-outlines/<lat>_<lon>.json`). It prints what it did to stderr and fails, writing
// nothing, when the file is over PLACES_BUDGET_BYTES in brotli; with --report it adds the places to the build report
// (Markdown).
//
//   pnpm --filter data build-places <places.osm.pbf | .osm> <graph file | extract | URL> <cities.json> <out.json>
//     [--sitelinks <wb_items_per_site.sql.gz | URL>] [--no-wikidata] [--report <report.md>]
//
// By default it downloads Wikidata's latest dump of the sitelinks (`wb_items_per_site`, about 2 GB).
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { placesMarkdown } from '../build-report.ts';
import { decodeCities, parseCitiesFile } from '../cities-file.ts';
import { openOsm } from '../osm/open.ts';
import { encodePlaceOutlines, encodePlaces, PLACE_OUTLINES_PATH, PLACES_PATH } from '../places-file.ts';
import { buildPlaces, MAX_ACCESS_METERS, MAX_SQUARE_KM, MIN_SITELINKS } from '../places.ts';
import { readPlaceRussianNames } from '../russian-names.ts';
import { wikidataPlaces } from '../wikidata.ts';
// oxlint-disable-next-line import/max-dependencies -- the command wires each of its inputs (OSM, the graph, the cities, the sitelinks, Wikidata, the table of names) to the builder and writes two outputs, each from its own module
import { brotliBytes, fileLines, log, seconds, sizes, userPath, withLocalFile } from './input.ts';
import { loadGraph } from './load-graph.ts';

/** The file the screen downloads once: 0.6 MB in brotli of quality 11, as the Worker serves it (spec #154 «Сборка мест»). */
const PLACES_BUDGET_BYTES = 600_000;

/** Waits as long as Wikidata's Query Service asks. */
function sleep(ms: number): Promise<void> {
	return new Promise((done) => {
		setTimeout(done, ms);
	});
}

const SITELINKS = 'https://dumps.wikimedia.org/wikidatawiki/latest/wikidatawiki-latest-wb_items_per_site.sql.gz';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		sitelinks: { type: 'string', default: SITELINKS },
		'no-wikidata': { type: 'boolean', default: false },
		report: { type: 'string' },
	},
});
const placesOsm = positionals.at(0);
const graphFile = positionals.at(1);
const citiesJson = positionals.at(2);
const out = positionals.at(3);
if (placesOsm === undefined || graphFile === undefined || citiesJson === undefined || out === undefined) {
	log(
		'usage: pnpm --filter data build-places <places.osm.pbf | .osm> <graph file | extract | URL> <cities.json> <out.json> ' +
			'[--sitelinks <wb_items_per_site.sql.gz | URL>] [--no-wikidata] [--report <report.md>]',
	);
	process.exit(2);
}

const { graph } = await withLocalFile(graphFile, loadGraph);
const cities = decodeCities(parseCitiesFile(JSON.parse(readFileSync(userPath(citiesJson), 'utf8')))).map(
	([, , , lat, lon, population]) => ({
		lat,
		lon,
		population,
	}),
);
const started = performance.now();
const { places, cells, report } = await buildPlaces({
	osm: openOsm(userPath(placesOsm)),
	sitelinks: fileLines(values.sitelinks),
	wikidata: values['no-wikidata']
		? () => Promise.resolve(new Map())
		: (qids) => {
				log(`Wikidata: asking for the labels of ${qids.length} places`);
				return wikidataPlaces(qids, { fetch, sleep, log });
			},
	graph,
	cities,
	russianNames: readPlaceRussianNames(),
});
const json = JSON.stringify(encodePlaces(places));
const brotli = brotliBytes(json);

log(`${report.places} places of ${report.objects} objects of ${placesOsm}, in ${seconds(started)}`);
log(
	`left out: ${report.belowSitelinks} of fewer than ${MIN_SITELINKS} sitelinks, ${report.withoutOutline} without a whole outline, ` +
		`${report.tooLarge} over ${MAX_SQUARE_KM} km², ${report.inCities} within a city, ` +
		`${report.withoutAccess} with no road within ${MAX_ACCESS_METERS / 1000} km, ${report.notMonasteries} places of worship that are no monastery`,
);
const { withoutRussian } = report;
log(
	`without a Russian name and not in the table of Russian names of places: ${withoutRussian.count}${withoutRussian.mostFamous
		.map(({ qid, name }, index) => `${index === 0 ? '; the most famous: ' : ', '}Q${qid}${name === '' ? '' : ` ${name}`}`)
		.join('')}`,
);
if (values.report !== undefined) {
	// After the graph's and the cities' parts.
	appendFileSync(userPath(values.report), `\n${placesMarkdown(report, brotli, PLACES_BUDGET_BYTES)}`);
	log(`added the places to ${values.report}`);
}
if (brotli > PLACES_BUDGET_BYTES) {
	log(`the places file is ${sizes(json, brotli)}, over the budget of ${(PLACES_BUDGET_BYTES / 1e6).toFixed(2)} MB: not written`);
	process.exit(1);
}
writeFileSync(userPath(out), json);
log(`wrote ${out}: ${sizes(json, brotli)} of ${(PLACES_BUDGET_BYTES / 1e6).toFixed(2)}`);
// The cells beside the file, as the Worker serves them beside it; those of an earlier build go.
const outlines = join(dirname(userPath(out)), PLACE_OUTLINES_PATH.slice(PLACES_PATH.lastIndexOf('/') + 1));
rmSync(outlines, { recursive: true, force: true });
mkdirSync(outlines, { recursive: true });
for (const [name, cell] of cells) {
	writeFileSync(join(outlines, `${name}.json`), JSON.stringify(encodePlaceOutlines(cell)));
}
log(
	`wrote ${report.cells.count} cells of the outlines of ${report.cells.outlines} places and the radii of ${report.cells.radii}, ` +
		`${(report.cells.bytes / 1e6).toFixed(2)} MB, to ${outlines}`,
);
