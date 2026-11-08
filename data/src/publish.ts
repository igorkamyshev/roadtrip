// The dataset in R2 (spec «Набор данных», «Выкладка»): each version's files under `<version>/`, and `current.json`,
// the pointer to the current version, which the deploy (#36) reads. The pointer moves only once every file of the
// version is uploaded and its size checked, so a failed run leaves the version before it current.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The files of a dataset, as the world build writes them into one directory. */
export const DATASET_FILES = ['graph.graph', 'zones.json', 'cities.json', 'dataset.json', 'report.md'] as const;

/** The key of the pointer to the current version. */
export const POINTER = 'current.json';

/** A version's files, with what the deploy checks them by: `<version>/manifest.json`, and `current.json`. */
export interface Manifest {
	readonly version: string;
	readonly files: Readonly<Record<string, { readonly size: number; readonly sha256: string }>>;
}

/** Where the dataset goes: R2 by its S3 API in the world build (`cli/publish-dataset.ts`), a double in the tests. */
export interface DatasetStore {
	/** Uploads the local file at `path` under `key`. */
	upload(key: string, path: string): Promise<void>;
	/** The size of the object under `key`, or undefined when there is none. */
	size(key: string): Promise<number | undefined>;
	read(key: string): Promise<string | undefined>;
	write(key: string, text: string): Promise<void>;
}

/**
 * Uploads the dataset in `directory` under its version (`dataset.json`), checks each object's size, writes the
 * version's manifest and then points `current.json` at it. Returns the manifest and the version that was current.
 */
export async function publishDataset(
	store: DatasetStore,
	directory: string,
	log: (line: string) => void,
): Promise<{ manifest: Manifest; previous: string | undefined }> {
	for (const name of DATASET_FILES) {
		if (!existsSync(join(directory, name))) {
			throw new Error(`The dataset in ${directory} lacks ${name}`);
		}
	}
	const { version } = JSON.parse(readFileSync(join(directory, 'dataset.json'), 'utf8')) as { version?: unknown };
	if (typeof version !== 'string' || !/^[\w.-]+$/u.test(version)) {
		throw new Error(`dataset.json in ${directory} names no version a key can hold: ${JSON.stringify(version)}`);
	}
	const files: Record<string, { size: number; sha256: string }> = {};
	for (const name of DATASET_FILES) {
		const path = join(directory, name);
		files[name] = { size: statSync(path).size, sha256: await sha256(path) };
	}
	for (const name of DATASET_FILES) {
		const key = `${version}/${name}`;
		const started = performance.now();
		await store.upload(key, join(directory, name));
		const size = await store.size(key);
		if (size !== files[name].size) {
			throw new Error(`${key} is ${size ?? 'missing'} bytes in the bucket, ${files[name].size} on disk`);
		}
		log(`uploaded ${key}: ${(size / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s`);
	}
	const manifest: Manifest = { version, files };
	const json = `${JSON.stringify(manifest, null, '\t')}\n`;
	await store.write(`${version}/manifest.json`, json);
	const before = await store.read(POINTER);
	const previous = before === undefined ? undefined : (JSON.parse(before) as Partial<Manifest>).version;
	await store.write(POINTER, json);
	log(`${POINTER} now points at ${version}${previous === undefined ? '' : `, was ${previous}`}`);
	return { manifest, previous };
}

async function sha256(path: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(path)) {
		hash.update(chunk as Buffer);
	}
	return hash.digest('hex');
}
