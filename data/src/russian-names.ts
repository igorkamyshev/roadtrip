// The table of Russian names (data/russian-names.tsv, #130): by GeoNames' id, a city's Russian name where GeoNames and
// Wikidata have none or a broken one, written by Haiku subagents (data/AGENTS.md, «Cities file»). The deploy puts it
// over the names of the cities file R2 holds (`withRussianNames`); the build of the cities file only reports the
// cities it lacks (`missingRussianNames`).
import { type CitiesFile, type CityRow, decodeCities, encodeCities } from './cities-file.ts';

/** The table's first line. */
const HEADER = 'geonameid\tname\tru';

/** A name of Russian letters, digits, space, hyphen, dot, brackets and apostrophe, from a letter or a digit. */
const RUSSIAN = /^[А-Яа-яЁё0-9][А-Яа-яЁё0-9 .()'-]*$/u;

/** How many of the cities `missingRussianNames` lacks it names. */
const BIGGEST_MISSING = 10;

/** The table's Russian names by GeoNames' id; an error naming the line for a table of another shape or a name not in Russian. */
export function parseRussianNames(text: string): Map<number, string> {
	const lines = text.split('\n');
	if (lines[0] !== HEADER) {
		throw new Error(`line 1: not the header ${JSON.stringify(HEADER)}: ${JSON.stringify(lines[0])}`);
	}
	// The empty string after the last line's newline is no line.
	const rows = lines.at(-1) === '' ? lines.slice(1, -1) : lines.slice(1);
	const names = new Map<number, string>();
	for (const [index, line] of rows.entries()) {
		const row = tableRow(line, names);
		if (typeof row === 'string') {
			throw new TypeError(`line ${index + 2}: ${row}: ${JSON.stringify(line)}`);
		}
		names.set(row.id, row.russian);
	}
	return names;
}

/** A line of the table after the lines already read: its id and name, or what is wrong with it. */
function tableRow(line: string, earlier: ReadonlyMap<number, string>): { id: number; russian: string } | string {
	const columns = line.split('\t');
	const [id = '', , russian = ''] = columns;
	if (columns.length !== 3) {
		return 'not three columns separated by tabs';
	}
	if (!/^[1-9]\d*$/u.test(id)) {
		return 'the id is not a positive integer';
	}
	if (!RUSSIAN.test(russian)) {
		return 'the name is not in Russian letters';
	}
	return earlier.has(Number(id)) ? `the id ${id} is in an earlier line` : { id: Number(id), russian };
}

/** The cities file with the table's names for the cities it lists, how many it named, and how many of the table's ids the file lacks. */
export function withRussianNames(
	file: CitiesFile,
	names: ReadonlyMap<number, string>,
): { file: CitiesFile; named: number; notInFile: number } {
	let named = 0;
	const cities = decodeCities(file).map((row): CityRow => {
		const [id, , local, lat, lon, population, zone] = row;
		const russian = names.get(id);
		if (russian === undefined) {
			return row;
		}
		named += 1;
		return [id, russian, local, lat, lon, population, zone];
	});
	return { file: encodeCities(cities), named, notInFile: names.size - named };
}

/** The cities without a Russian name that the table lacks: how many, and the biggest of them (`BIGGEST_MISSING`). */
export interface MissingRussianNames {
	readonly count: number;
	/** Biggest first, each with GeoNames' `name`. */
	readonly biggest: readonly { readonly id: number; readonly name: string }[];
}

/**
 * Of the cities, biggest first (as `buildCities` has them), those without a Russian name that the table lacks, so
 * the deploy leaves them in their local names.
 */
export function missingRussianNames(cities: readonly CityRow[], names: ReadonlyMap<number, string>): MissingRussianNames {
	const missing = cities.filter(([id, russian]) => russian === '' && !names.has(id));
	return { count: missing.length, biggest: missing.slice(0, BIGGEST_MISSING).map(([id, , name]) => ({ id, name })) };
}
