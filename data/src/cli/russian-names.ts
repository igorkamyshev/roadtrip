// Puts the tables of Russian names (src/russian-names.ts) over the names of the cities file and the places file, in
// place: the deploy's step after fetch-dataset, so an edit of a table reaches the screen with the next deploy and needs
// no new dataset (#130, #158). Both tables are read first: a bad one fails it before any file is touched.
//
//   pnpm --filter data russian-names [<cities.json | places.json | directory>…] [--names <table.tsv>] [--place-names <table.tsv>]
//
// A file is a cities file or a places file by what it holds; a directory stands for its cities.json and, when it
// holds one, its places.json (a dataset without places has none). By default the directory fetch-dataset fills,
// web/public/data/, and the shipped tables: russian-names.tsv for the cities, place-russian-names.tsv for the places.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { field } from 'engine/json';
import { parseCitiesFile } from '../cities-file.ts';
import { parsePlacesFile } from '../places-file.ts';
import { readPlaceRussianNames, readRussianNames, withPlaceRussianNames, withRussianNames } from '../russian-names.ts';
import { fetchedFiles, log, userPath } from './input.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { names: { type: 'string' }, 'place-names': { type: 'string' } },
});
const files = fetchedFiles(positionals, ['cities.json']);
const citiesTable = values.names === undefined ? undefined : userPath(values.names);
const placesTable = values['place-names'] === undefined ? undefined : userPath(values['place-names']);

// Read first: a bad table, or a bad file, fails before any file is touched.
const cityNames = readRussianNames(citiesTable);
const placeNames = readPlaceRussianNames(placesTable);
const named = files.map((path) => {
	const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
	const cities = field(json, 'places') === undefined;
	const {
		file,
		named: count,
		notInFile,
	} = cities ? withRussianNames(parseCitiesFile(json), cityNames) : withPlaceRussianNames(parsePlacesFile(json), placeNames);
	const [table, what, keys] = cities
		? [citiesTable ?? 'the shipped table', 'cities', 'ids']
		: [placesTable ?? 'the shipped table of places', 'places', 'Q-ids'];
	return {
		path,
		file,
		line: `Russian names of ${table} in ${path}: ${count} ${what} named; ${keys} of the table not in the file: ${notInFile}`,
	};
});
for (const { path, file, line } of named) {
	writeFileSync(path, JSON.stringify(file));
	log(line);
}
