// The deploy's side of the dataset in R2 (spec #20 «Набор данных», «Деплой»; #36): the version the pointer
// `current.json` names, which the world build moves last (src/publish.ts).
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { unpackPlaceOutlines } from './place-outlines-bundle.ts';
import { type Manifest, parseManifest, PLACE_OUTLINES_FILE, PLACES_FILE, POINTER } from './publish.ts';

/** Where the deploy reads the dataset from: R2 by Cloudflare's API (`cli/fetch-dataset.ts`), a double in the tests. */
export interface DatasetSource {
	/** The bytes of the object under `key`, or undefined when there is none. */
	readonly get: (key: string) => Promise<AsyncIterable<Uint8Array> | undefined>;
}

/** The places' files, which a dataset may lack (one from before the places, spec #154): the deploy then goes on without them. */
const OPTIONAL = new Set([PLACES_FILE, PLACE_OUTLINES_FILE]);

/**
 * Puts the files of the current version in their places: `destinations` maps a file of the dataset (`graph.graph`) to its
 * local path, and the cells of the outlines (`PLACE_OUTLINES_FILE`) to the directory each cell's file goes in, in
 * place of those there were. Each file is downloaded next to its place and checked against the pointer's size and
 * SHA-256; only when every one matches do they all take their places, so a failed download leaves the files there
 * were. A version without the places' files puts none. Returns the pointer, the version's manifest.
 */
export async function fetchDataset(
	source: DatasetSource,
	destinations: Readonly<Record<string, string>>,
	log: (line: string) => void,
): Promise<Manifest> {
	const manifest = parseManifest(await text(source, POINTER), POINTER);
	const taken = Object.entries(destinations).filter(([name]) => {
		if (Object.hasOwn(manifest.files, name)) {
			return true;
		}
		if (!OPTIONAL.has(name)) {
			throw new Error(`${POINTER} lists no ${name}`);
		}
		log(`${manifest.version} has no ${name}: the deploy goes on without it`);
		return false;
	});
	const placings = taken.map(([name, path]) => ({ name, path, placing: name === PLACE_OUTLINES_FILE ? CELLS : ONE_FILE }));
	try {
		for (const { name, path, placing } of placings) {
			await download(source, { key: `${manifest.version}/${name}`, path, expected: manifest.files[name] }, log);
			placing.unpack(path, (line) => {
				log(`${manifest.version}/${name}: ${line}`);
			});
		}
	} catch (error) {
		for (const { path } of placings) {
			rmSync(`${path}.download`, { force: true });
			rmSync(`${path}.cells`, { recursive: true, force: true });
		}
		throw error;
	}
	for (const { name, path, placing } of placings) {
		placing.place(path);
		log(`${manifest.version}/${name} → ${path}`);
	}
	return manifest;
}

/**
 * How a file downloaded to `<path>.download` takes its place: what is done with it once it came (`unpack`), and once
 * every file came (`place`).
 */
interface Placing {
	readonly unpack: (path: string, log: (line: string) => void) => void;
	readonly place: (path: string) => void;
}

/** A file of the dataset takes its path as it came. */
const ONE_FILE: Placing = {
	unpack: () => {},
	place: (path) => {
		renameSync(`${path}.download`, path);
	},
};

/** The cells of the outlines, a file per cell in `<path>.cells`, take the place of the directory of the cells there were. */
const CELLS: Placing = {
	unpack: (path, log) => {
		log(`${unpackPlaceOutlines(readFileSync(`${path}.download`, 'utf8'), `${path}.cells`)} cells of the outlines`);
	},
	place: (path) => {
		rmSync(path, { recursive: true, force: true });
		renameSync(`${path}.cells`, path);
		rmSync(`${path}.download`);
	},
};

/** Downloads the object under `key` to `<path>.download` and checks its size and SHA-256. */
async function download(
	source: DatasetSource,
	{ key, path, expected }: { key: string; path: string; expected: Manifest['files'][string] },
	log: (line: string) => void,
): Promise<void> {
	const body = await source.get(key);
	if (body === undefined) {
		throw new Error(`${key} is not in the bucket`);
	}
	mkdirSync(dirname(path), { recursive: true });
	const started = performance.now();
	const hash = createHash('sha256');
	let size = 0;
	await pipeline(
		body,
		async function* (chunks: AsyncIterable<Uint8Array>) {
			for await (const chunk of chunks) {
				hash.update(chunk);
				size += chunk.length;
				yield chunk;
			}
		},
		createWriteStream(`${path}.download`),
	);
	const sha256 = hash.digest('hex');
	if (size !== expected.size || sha256 !== expected.sha256) {
		throw new Error(`${key} came as ${size} bytes with SHA-256 ${sha256}, ${POINTER} says ${expected.size} bytes, ${expected.sha256}`);
	}
	log(`downloaded ${key}: ${(size / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s, SHA-256 checked`);
}

async function text(source: DatasetSource, key: string): Promise<string> {
	const body = await source.get(key);
	if (body === undefined) {
		throw new Error(`${key} is not in the bucket`);
	}
	const chunks: Uint8Array[] = [];
	for await (const chunk of body) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks).toString('utf8');
}
