// The tables edited by hand that the deploy puts over the files R2 holds, and the build of a file reads for its report
// (data/AGENTS.md): the tables of Russian names (src/russian-names.ts) and the table of exclusions of places
// (src/place-exclusions.ts). Each is TSV, its header first, then a line per key: the key, a column for a person to
// read, and the value. They are read alike and checked as they are read: a bad line fails the deploy, naming it.
import { readFileSync } from 'node:fs';

/** The shape of a table: its first line, its key with the number it stands for in its first group, and its value. */
export interface TableShape {
	/** The table that ships in the repository, read by default. */
	readonly shipped: string;
	readonly header: string;
	readonly key: RegExp;
	/** What a line's key is not when it does not match `key`. */
	readonly keyIs: string;
	readonly value: RegExp;
	/** What is wrong with a line whose value does not match `value`. */
	readonly badValue: string;
}

/** The values of the table at `path` by key, checked: an error naming the file and the line for a bad one. */
export function readTable(path: string, shape: TableShape): Map<number, string> {
	try {
		return parseTable(readFileSync(path, 'utf8'), shape);
	} catch (error) {
		throw new Error(`${path}, ${error instanceof Error ? error.message : String(error)}`, { cause: error });
	}
}

/** The table's values by key; an error naming the line for a table of another shape or a bad value. */
function parseTable(text: string, shape: TableShape): Map<number, string> {
	const lines = text.split('\n');
	if (lines[0] !== shape.header) {
		throw new Error(`line 1: not the header ${JSON.stringify(shape.header)}: ${JSON.stringify(lines[0])}`);
	}
	// The empty string after the last line's newline is no line.
	const rows = lines.at(-1) === '' ? lines.slice(1, -1) : lines.slice(1);
	const values = new Map<number, string>();
	for (const [index, line] of rows.entries()) {
		const row = tableRow(line, shape, values);
		if (typeof row === 'string') {
			throw new TypeError(`line ${index + 2}: ${row}: ${JSON.stringify(line)}`);
		}
		values.set(row.id, row.value);
	}
	return values;
}

/** A line of the table after the lines already read: its key and value, or what is wrong with it. */
function tableRow(line: string, shape: TableShape, earlier: ReadonlyMap<number, string>): { id: number; value: string } | string {
	const columns = line.split('\t');
	const [key = '', , value = ''] = columns;
	if (columns.length !== 3) {
		return 'not three columns separated by tabs';
	}
	const id = Number(shape.key.exec(key)?.[1]);
	if (!Number.isSafeInteger(id)) {
		return `the id is not ${shape.keyIs}`;
	}
	if (!shape.value.test(value)) {
		return shape.badValue;
	}
	return earlier.has(id) ? `the id ${key} is in an earlier line` : { id, value };
}
