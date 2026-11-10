// Puts the table of Russian names (data/russian-names.tsv, src/russian-names.ts) over the names of the cities file, in
// place: the deploy's step after fetch-dataset, so an edit of the table reaches the screen with the next deploy and
// needs no new dataset (#130). A bad table fails it before the file is touched.
//
//   pnpm --filter data russian-names [<cities.json>] [--names <table.tsv>]
//
// By default the cities file fetch-dataset puts in web/public/data/ and the shipped table.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseCitiesFile } from '../cities-file.ts';
import { withRussianNames } from '../russian-names.ts';
import { log, readRussianNames, userPath } from './input.ts';

const ROOT = join(import.meta.dirname, '../../..');

const { values, positionals } = parseArgs({ allowPositionals: true, options: { names: { type: 'string' } } });
const given = positionals.at(0);
const citiesPath = given === undefined ? join(ROOT, 'web/public/data/cities.json') : userPath(given);
const table = values.names === undefined ? undefined : userPath(values.names);

// Read first: a bad table fails before the file is touched.
const names = readRussianNames(table);
const { file, named, notInFile } = withRussianNames(parseCitiesFile(JSON.parse(readFileSync(citiesPath, 'utf8'))), names);
writeFileSync(citiesPath, JSON.stringify(file));
log(
	`Russian names of ${table ?? 'the shipped table'} in ${citiesPath}: ${named} cities named; ids of the table not in the file: ${notInFile}`,
);
