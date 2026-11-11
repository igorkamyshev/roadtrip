// The dataset in R2 (spec #20 «Набор данных», «Выкладка»): each version's files under `<version>/`, and `current.json`,
// the pointer to the current version, which the deploy reads (src/fetch-dataset.ts). The pointer moves only once every file of the
// version is uploaded and its size checked, so a failed run leaves the version before it current. A version whose
// manifest is in the bucket keeps its files: the same files again are a rerun, other files take a new version. A
// dataset of the world that lost a country's zone goes nowhere. The places' files come from a job of their own (spec
// #154 «Ежемесячная сборка и деплой»): when it failed, the version takes the previous one's, and its report says so.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { COUNTRIES } from 'rules/countries';
import { field, isRecord, items } from 'engine/json';
import { type FailedPlacesOrigin, placesFailedMarkdown } from './build-report.ts';
import { packPlaceOutlines } from './place-outlines-bundle.ts';
import { PLACE_OUTLINES_PATH, PLACES_PATH } from './places-file.ts';
import { ZONELESS_COUNTRIES } from './zoneless.ts';

/** The files of a dataset, as the world build writes them into one directory. */
const DATASET_FILES = ['graph.graph', 'zones.json', 'cities.json', 'dataset.json', 'report.md'] as const;

/** The places file, as `build-places` writes it and the Worker serves it. */
export const PLACES_FILE = basename(PLACES_PATH);

/** The directory of the cells of the outlines beside the places file, as `build-places` writes it and the Worker serves it. */
export const PLACE_OUTLINES_DIRECTORY = basename(PLACE_OUTLINES_PATH);

/** The cells of the outlines in the version: one file of them all (`packPlaceOutlines`). */
export const PLACE_OUTLINES_FILE = `${PLACE_OUTLINES_DIRECTORY}.tsv`;

/** The places' files of a version, which the places job builds and the version before lends when it failed. */
const PLACES_FILES = [PLACES_FILE, PLACE_OUTLINES_FILE] as const;

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
	/** Copies the object under `from` to `to`, in the bucket. */
	readonly copy: (from: string, to: string) => Promise<void>;
}

export interface PublishOptions {
	/** Where progress goes: a line per step. */
	readonly log: (line: string) => void;
	/** The dataset holds some parts of the world only, so its countries' zones are not checked. */
	readonly trial?: boolean;
	/**
	 * The places job failed, so the dataset has no places' files: the version takes those of the current one, if it
	 * has them, and its report says so.
	 */
	readonly placesFailed?: boolean;
}

/**
 * Uploads the dataset in `directory` under its version (`dataset.json`), checks each object's size, writes the
 * version's manifest and then points `current.json` at it. Returns the manifest, the version that was current and
 * where the places came from: this build, the version before (`placesFailed`), or nowhere. Uploads nothing when a
 * country with a zone in the world has none in the zone outlines, but in a trial, which holds some parts of the world
 * only, or when the version's manifest in the bucket has other files.
 */
export async function publishDataset(
	store: DatasetStore,
	directory: string,
	{ log, trial = false, placesFailed = false }: PublishOptions,
): Promise<{ manifest: Manifest; previous: string | undefined; places: PlacesOrigin }> {
	const version = datasetVersion(directory, placesFailed);
	if (!trial) {
		checkZones(directory);
	}
	const staging = mkdtempSync(join(tmpdir(), 'roadtrip-publish-'));
	try {
		const { places, lent } = placesFailed ? await previousPlaces(store) : { places: BUILT, lent: {} };
		const paths = localFiles(directory, staging, places);
		const files: Record<string, FileCheck> = { ...lent };
		for (const [name, path] of paths) {
			files[name] = { size: statSync(path).size, sha256: await sha256(path) };
		}
		await checkPublished(store, { version, files }, log);
		for (const [name, path] of paths) {
			await upload(store, { key: `${version}/${name}`, path, size: files[name].size }, log);
		}
		if (places.from === 'previous' && places.version !== version) {
			await copyLent(store, { from: places.version, to: version, files: lent }, log);
		}
		const manifest: Manifest = { version, files };
		const json = `${JSON.stringify(manifest, null, '\t')}\n`;
		await store.write(`${version}/manifest.json`, json);
		const previous = await currentVersion(store);
		await store.write(POINTER, json);
		log(`${POINTER} now points at ${version}${previous === undefined ? '' : `, was ${previous}`}`);
		return { manifest, previous, places };
	} finally {
		rmSync(staging, { recursive: true, force: true });
	}
}

/** Where a version's places came from: this build, or, when their job failed, the version before or nowhere. */
export type PlacesOrigin = { readonly from: 'build' } | FailedPlacesOrigin;

const BUILT: PlacesOrigin = { from: 'build' };

/** The places' files of the current version, by the pointer, for a dataset whose places job failed: those it lends. */
async function previousPlaces(store: DatasetStore): Promise<{ places: PlacesOrigin; lent: Record<string, FileCheck> }> {
	const pointer = await store.read(POINTER);
	if (pointer === undefined) {
		return { places: { from: 'none', previous: undefined }, lent: {} };
	}
	const { version, files } = parseManifest(pointer, POINTER);
	if (!PLACES_FILES.every((name) => Object.hasOwn(files, name))) {
		return { places: { from: 'none', previous: version }, lent: {} };
	}
	return { places: { from: 'previous', version }, lent: Object.fromEntries(PLACES_FILES.map((name) => [name, files[name]])) };
}

/** Refuses a version published with other files; the same files again are a rerun. */
async function checkPublished(store: DatasetStore, { version, files }: Manifest, log: (line: string) => void): Promise<void> {
	const published = await store.read(`${version}/manifest.json`);
	if (published === undefined) {
		return;
	}
	const other = otherFiles(parseManifest(published, `${version}/manifest.json`).files, files);
	if (other.length > 0) {
		throw new Error(
			`${version} is published with another ${other.join(', ')}: a published version keeps its files, ` +
				'so publish this dataset under a new version (dataset.json)',
		);
	}
	log(`${version} is published with these files already: publishing them again`);
}

/**
 * The files to upload, by their names in the version: the dataset's own, and the places' when this build has them,
 * the cells packed into one file in `staging`. Without them, the report goes from `staging`, saying where the places
 * are from.
 */
function localFiles(directory: string, staging: string, places: PlacesOrigin): Map<string, string> {
	const paths = new Map<string, string>(DATASET_FILES.map((name) => [name, join(directory, name)]));
	if (places.from === 'build') {
		const packed = join(staging, PLACE_OUTLINES_FILE);
		writeFileSync(packed, packPlaceOutlines(join(directory, PLACE_OUTLINES_DIRECTORY)));
		return paths.set(PLACES_FILE, join(directory, PLACES_FILE)).set(PLACE_OUTLINES_FILE, packed);
	}
	const report = join(staging, 'report.md');
	writeFileSync(report, `${readFileSync(join(directory, 'report.md'), 'utf8')}\n${placesFailedMarkdown(places)}`);
	return paths.set('report.md', report);
}

/** A manifest as `publishDataset` writes it; an error naming `key` for anything else. */
export function parseManifest(text: string, key: string): Manifest {
	const json: unknown = JSON.parse(text);
	const version = field(json, 'version');
	const files = field(json, 'files');
	if (typeof version !== 'string' || !isRecord(files)) {
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

/** The dataset's version, once every file of it is there, the places' too unless their job failed: one a key can hold. */
function datasetVersion(directory: string, placesFailed: boolean): string {
	for (const name of placesFailed ? DATASET_FILES : [...DATASET_FILES, PLACES_FILE, PLACE_OUTLINES_DIRECTORY]) {
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

/** Copies the files a version lends into another, each object checked by its size in the bucket. */
async function copyLent(
	store: DatasetStore,
	{ from, to, files }: { from: string; to: string; files: Manifest['files'] },
	log: (line: string) => void,
): Promise<void> {
	for (const [name, file] of Object.entries(files)) {
		await store.copy(`${from}/${name}`, `${to}/${name}`);
		const size = await store.size(`${to}/${name}`);
		if (size !== file.size) {
			throw new Error(`${to}/${name} is ${size ?? 'missing'} bytes in the bucket, ${file.size} in the manifest of ${from}`);
		}
		log(`copied ${from}/${name} to ${to}/${name}: ${(size / 1e6).toFixed(1)} MB`);
	}
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
