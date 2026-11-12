// Takes the places the table of exclusions of places puts out (src/place-exclusions.ts) from the places file, in
// place: the deploy's step after fetch-dataset, so an edit of the table reaches the screen with the next deploy and
// needs no new dataset (#169). The table is read first: a bad one fails it before any file is touched.
//
//   pnpm --filter data exclude-places [<places.json | directory>…] [--table <table.tsv>]
//
// A directory stands for its places.json, when it holds one (a dataset without places has none). By default the
// directory fetch-dataset fills, web/public/data/, and the shipped table, place-exclusions.tsv. The cells of the
// outlines stay: the screen shows only the places of the file.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readPlaceExclusions, withoutExcludedPlaces } from '../place-exclusions.ts';
import { parsePlacesFile } from '../places-file.ts';
import { fetchedFiles, log, userPath } from './input.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { table: { type: 'string' } } });
const files = fetchedFiles(positionals, []);
const table = values.table === undefined ? undefined : userPath(values.table);

// Read first: a bad table, or a bad file, fails before any file is touched.
const decisions = readPlaceExclusions(table);
const excluded = files.map(
	(path) => [path, withoutExcludedPlaces(parsePlacesFile(JSON.parse(readFileSync(path, 'utf8'))), decisions)] as const,
);
for (const [path, { file, removed, notInFile }] of excluded) {
	writeFileSync(path, JSON.stringify(file));
	log(
		`exclusions of ${table ?? 'the shipped table'} in ${path}: ${removed} places taken out; out Q-ids of the table not in the file: ${notInFile}`,
	);
}
