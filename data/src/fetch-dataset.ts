// The deploy's side of the dataset in R2 (spec «Набор данных», «Деплой»; #36): the version the pointer `current.json`
// names, which the world build moves last (src/publish.ts).
import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { type Manifest, parseManifest, POINTER } from './publish.ts';

/** Where the deploy reads the dataset from: R2 by Cloudflare's API (`cli/fetch-dataset.ts`), a double in the tests. */
export interface DatasetSource {
	/** The bytes of the object under `key`, or undefined when there is none. */
	readonly get: (key: string) => Promise<AsyncIterable<Uint8Array> | undefined>;
}

/**
 * Puts the files of the current version in their places: `places` maps a file of the dataset (`graph.graph`) to its
 * local path. Each file is downloaded next to its place and checked against the pointer's size and SHA-256; only when
 * every one matches do they all take their places, so a failed download leaves the files there were. Returns the
 * pointer, the version's manifest.
 */
export async function fetchDataset(
	source: DatasetSource,
	places: Readonly<Record<string, string>>,
	log: (line: string) => void,
): Promise<Manifest> {
	const manifest = parseManifest(await text(source, POINTER), POINTER);
	const downloads: string[] = [];
	try {
		for (const [name, path] of Object.entries(places)) {
			const key = `${manifest.version}/${name}`;
			if (!Object.hasOwn(manifest.files, name)) {
				throw new Error(`${POINTER} lists no ${name}`);
			}
			const expected = manifest.files[name];
			const body = await source.get(key);
			if (body === undefined) {
				throw new Error(`${key} is not in the bucket`);
			}
			mkdirSync(dirname(path), { recursive: true });
			const download = `${path}.download`;
			downloads.push(download);
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
				createWriteStream(download),
			);
			const sha256 = hash.digest('hex');
			if (size !== expected.size || sha256 !== expected.sha256) {
				throw new Error(`${key} came as ${size} bytes with SHA-256 ${sha256}, ${POINTER} says ${expected.size} bytes, ${expected.sha256}`);
			}
			log(`downloaded ${key}: ${(size / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s, SHA-256 checked`);
		}
	} catch (error) {
		for (const download of downloads) {
			rmSync(download, { force: true });
		}
		throw error;
	}
	for (const [name, path] of Object.entries(places)) {
		renameSync(`${path}.download`, path);
		log(`${manifest.version}/${name} → ${path}`);
	}
	return manifest;
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
