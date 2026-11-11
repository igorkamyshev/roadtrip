// The cells of the outlines in the dataset in R2 (spec #154 «Ежемесячная сборка и деплой»): thousands of small files,
// as `build-places` writes them beside the places file and the Worker serves them, go into the version as one file, a
// line per cell, `<cell>\t<its file>`, in order of the cell's name. One object is one upload and one download, and one
// size and SHA-256 in the manifest; the deploy reads R2 through Cloudflare's API, which answers 1 200 requests in 5
// minutes. `publish.ts` packs the directory, `fetch-dataset.ts` unpacks it into the client's static assets.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A cell's name, by its south-west corner (`placeOutlinesCell`): `44_20`, `-34_-71`. */
const CELL = /^-?\d+_-?\d+$/u;

/** The cells' files in `directory` (`<cell>.json`) as one text; an error for a file of another name. */
export function packPlaceOutlines(directory: string): string {
	return readdirSync(directory)
		.toSorted()
		.map((file) => {
			const cell = file.replace(/\.json$/u, '');
			if (!CELL.test(cell) || cell === file) {
				throw new Error(`${join(directory, file)} is no cell of the outlines (<lat>_<lon>.json)`);
			}
			return `${cell}\t${readFileSync(join(directory, file), 'utf8')}\n`;
		})
		.join('');
}

/** Writes each cell of `packed` into `directory` as `<cell>.json`, the file it was; returns how many. */
export function unpackPlaceOutlines(packed: string, directory: string): number {
	mkdirSync(directory, { recursive: true });
	const lines = packed.split('\n').filter((line) => line !== '');
	for (const [index, line] of lines.entries()) {
		const tab = line.indexOf('\t');
		const cell = line.slice(0, tab);
		if (tab < 0 || !CELL.test(cell)) {
			throw new Error(`line ${index + 1} of the cells of the outlines names no cell: ${line.slice(0, 40)}`);
		}
		writeFileSync(join(directory, `${cell}.json`), line.slice(tab + 1));
	}
	return lines.length;
}
