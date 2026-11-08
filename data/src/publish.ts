// The dataset in R2 (spec «Набор данных», «Выкладка»): each version's files under `<version>/`, and `current.json`,
// the pointer to the current version, which the deploy reads (src/fetch-dataset.ts). The pointer moves only once every file of the
// version is uploaded and its size checked, so a failed run leaves the version before it current. A version whose
// manifest is in the bucket keeps its files: the same files again are a rerun, other files take a new version. A
// dataset of the world that lost a country's zone goes nowhere.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COUNTRIES } from 'rules/countries';
import { field, items } from './json.ts';
import { ZONELESS_COUNTRIES } from './zoneless.ts';

/** The files of a dataset, as the world build writes them into one directory. */
const DATASET_FILES = ['graph.graph', 'zones.json', 'cities.json', 'dataset.json', 'report.md'] as const;

/** The key of the pointer to the current version. */
export const POINTER = 'current.json';

/** A file of a version, as the deploy checks it. */
interface FileCheck {
	readonly size: number;
	readonly sha256: string;
}

/** A version's files, with what the deploy checks them by: `<version>/manifest.json`, and `current.json`. */
export interface Manifest {
	readonly version: string;
	readonly files: Readonly<Record<string, FileCheck>>;
}

/** Where the dataset goes: R2 by its S3 API in the world build (`cli/publish-dataset.ts`), a double in the tests. */
export interface DatasetStore {
	/** Uploads the local file at `path` under `key`. */
	readonly upload: (key: string, path: string) => Promise<void>;
	/** The size of the object under `key`, or undefined when there is none. */
	readonly size: (key: string) => Promise<number | undefined>;
	readonly read: (key: string) => Promise<string | undefined>;
	readonly write: (key: string, text: string) => Promise<void>;
}

export interface PublishOptions {
	/** Where progress goes: a line per step. */
	readonly log: (line: string) => void;
	/** The dataset holds some parts of the world only, so its countries' zones are not checked. */
	readonly trial?: boolean;
}

/**
 * Uploads the dataset in `directory` under its version (`dataset.json`), checks each object's size, writes the
 * version's manifest and then points `current.json` at it. Returns the manifest and the version that was current.
 * Uploads nothing when a country with a zone in the world has none in the zone outlines, but in a trial, which
 * holds some parts of the world only, or when the version's manifest in the bucket has other files.
 */
export async function publishDataset(
	store: DatasetStore,
	directory: string,
	{ log, trial = false }: PublishOptions,
): Promise<{ manifest: Manifest; previous: string | undefined }> {
	const version = datasetVersion(directory);
	if (!trial) {
		checkZones(directory);
	}
	const files: Record<string, FileCheck> = {};
	for (const name of DATASET_FILES) {
		const path = join(directory, name);
		files[name] = { size: statSync(path).size, sha256: await sha256(path) };
	}
	const published = await store.read(`${version}/manifest.json`);
	if (published !== undefined) {
		const other = otherFiles(parseManifest(published, `${version}/manifest.json`).files, files);
		if (other.length > 0) {
			throw new Error(
				`${version} is published with another ${other.join(', ')}: a published version keeps its files, ` +
					'so publish this dataset under a new version (dataset.json)',
			);
		}
		log(`${version} is published with these files already: publishing them again`);
	}
	for (const name of DATASET_FILES) {
		await upload(store, { key: `${version}/${name}`, path: join(directory, name), size: files[name].size }, log);
	}
	const manifest: Manifest = { version, files };
	const json = `${JSON.stringify(manifest, null, '\t')}\n`;
	await store.write(`${version}/manifest.json`, json);
	const previous = await currentVersion(store);
	await store.write(POINTER, json);
	log(`${POINTER} now points at ${version}${previous === undefined ? '' : `, was ${previous}`}`);
	return { manifest, previous };
}

/** A manifest as `publishDataset` writes it; an error naming `key` for anything else. */
export function parseManifest(text: string, key: string): Manifest {
	const json: unknown = JSON.parse(text);
	const version = field(json, 'version');
	const files = field(json, 'files');
	if (typeof version !== 'string' || typeof files !== 'object' || files === null) {
		throw new Error(`${key} is no manifest: it lacks the version or the files`);
	}
	const checks: Record<string, FileCheck> = {};
	for (const name of Object.keys(files)) {
		const file = field(files, name);
		const size = field(file, 'size');
		const hash = field(file, 'sha256');
		if (typeof size !== 'number' || typeof hash !== 'string') {
			throw new TypeError(`${key} lists ${name} without its size and SHA-256`);
		}
		checks[name] = { size, sha256: hash };
	}
	return { version, files: checks };
}

/** The dataset's version, once every file of it is there: one a key can hold. */
function datasetVersion(directory: string): string {
	for (const name of DATASET_FILES) {
		if (!existsSync(join(directory, name))) {
			throw new Error(`The dataset in ${directory} lacks ${name}`);
		}
	}
	const version = field(JSON.parse(readFileSync(join(directory, 'dataset.json'), 'utf8')), 'version');
	if (typeof version !== 'string' || !/^[\w.-]+$/u.test(version)) {
		throw new Error(`dataset.json in ${directory} names no version a key can hold: ${JSON.stringify(version)}`);
	}
	return version;
}

/** Fails when a country of COUNTRIES with a zone in the world (not ZONELESS_COUNTRIES) has none in zones.json. */
function checkZones(directory: string): void {
	const features = items(field(JSON.parse(readFileSync(join(directory, 'zones.json'), 'utf8')), 'features'), 'zones.json’s features');
	const zones = new Set(features.map((feature) => field(field(feature, 'properties'), 'zone')));
	const lost = Object.keys(COUNTRIES).filter((code) => !ZONELESS_COUNTRIES.has(code) && !zones.has(code));
	if (lost.length > 0) {
		throw new Error(
			`zones.json in ${directory} has no zone for ${lost.join(', ')}, which the world has: a broken build, ` +
				'or for a country OSM has no zone of any more, a line in data/src/zoneless.ts',
		);
	}
}

/** The files one manifest has and the other lacks, or has with another SHA-256. */
function otherFiles(one: Manifest['files'], two: Manifest['files']): string[] {
	const names = new Set([...Object.keys(one), ...Object.keys(two)]);
	return [...names].filter((name) => one[name]?.sha256 !== two[name]?.sha256);
}

/** Uploads a file under `key` and checks its size in the bucket. */
async function upload(store: DatasetStore, file: { key: string; path: string; size: number }, log: (line: string) => void): Promise<void> {
	const started = performance.now();
	await store.upload(file.key, file.path);
	const size = await store.size(file.key);
	if (size !== file.size) {
		throw new Error(`${file.key} is ${size ?? 'missing'} bytes in the bucket, ${file.size} on disk`);
	}
	log(`uploaded ${file.key}: ${(size / 1e6).toFixed(1)} MB in ${((performance.now() - started) / 1000).toFixed(1)} s`);
}

/** The version the pointer names now, if any. */
async function currentVersion(store: DatasetStore): Promise<string | undefined> {
	const pointer = await store.read(POINTER);
	const version = pointer === undefined ? undefined : field(JSON.parse(pointer), 'version');
	return typeof version === 'string' ? version : undefined;
}

async function sha256(path: string): Promise<string> {
	const hash = createHash('sha256');
	// Without an encoding, a file stream gives Buffers.
	const chunks: AsyncIterable<Buffer> = createReadStream(path);
	for await (const chunk of chunks) {
		hash.update(chunk);
	}
	return hash.digest('hex');
}
