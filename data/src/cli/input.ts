import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { brotliCompressSync, createGunzip } from 'node:zlib';

/**
 * A path as the person typed it: `pnpm --filter data <command>` runs in data/, so a relative path is taken from
 * where pnpm was started.
 */
export function userPath(path: string): string {
	return resolve(process.env.INIT_CWD ?? process.cwd(), path);
}

/**
 * The command's arguments with a negative number after one of `options` joined to it, `--lon -3.7` as `--lon=-3.7`:
 * parseArgs takes a value that starts with a dash only after `=`.
 */
export function withNegativeValues(args: readonly string[], options: readonly string[]): string[] {
	const joined: string[] = [];
	for (const arg of args) {
		const previous = joined.at(-1);
		if (previous !== undefined && options.includes(previous) && /^-\d/u.test(arg)) {
			joined[joined.length - 1] = `${previous}=${arg}`;
		} else {
			joined.push(arg);
		}
	}
	return joined;
}

/** Runs `use` on a local copy of the file at `pathOrUrl`: the path itself, or a download deleted afterwards. */
export async function withLocalFile<T>(pathOrUrl: string, use: (path: string) => T): Promise<Awaited<T>> {
	const copy = await localCopy(pathOrUrl);
	try {
		// Awaited here, so that a download outlives an asynchronous `use`.
		return await use(copy.path);
	} finally {
		copy.remove();
	}
}

/**
 * The lines of a text file, a path or a URL: as it is, `<name>.txt` inside `<name>.zip`, as GeoNames packs its
 * dumps (`cities1000.zip`, `alternateNamesV2.zip`, `alternatenames/RS.zip`), streamed out of the archive by `unzip`,
 * or gzipped, as Wikimedia packs its dumps (`wikidatawiki-latest-wb_items_per_site.sql.gz`).
 */
export async function* fileLines(pathOrUrl: string): AsyncGenerator<string> {
	const copy = await localCopy(pathOrUrl);
	if (copy.path.endsWith('.gz')) {
		try {
			yield* createInterface({ input: createReadStream(copy.path).pipe(createGunzip()), crlfDelay: Infinity });
		} finally {
			copy.remove();
		}
		return;
	}
	const unzip = copy.path.endsWith('.zip')
		? spawn('unzip', ['-p', copy.path, `${basename(copy.path, '.zip')}.txt`], { stdio: ['ignore', 'pipe', 'inherit'] })
		: undefined;
	try {
		const exited =
			unzip === undefined
				? undefined
				: new Promise<number | null>((done, fail) => {
						unzip.once('close', done);
						unzip.once('error', fail);
					});
		yield* createInterface({ input: unzip?.stdout ?? createReadStream(copy.path), crlfDelay: Infinity });
		const code = exited === undefined ? 0 : await exited;
		if (code !== 0) {
			throw new Error(`unzip ${copy.path}: exit code ${String(code)}`);
		}
	} finally {
		unzip?.kill();
		copy.remove();
	}
}

/** The file at `pathOrUrl` on disk: the path itself, or a download that `remove` deletes. */
async function localCopy(pathOrUrl: string): Promise<{ path: string; remove: () => void }> {
	if (!/^https?:\/\//u.test(pathOrUrl)) {
		return { path: userPath(pathOrUrl), remove: () => {} };
	}
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-'));
	const remove = () => {
		rmSync(directory, { recursive: true, force: true });
	};
	try {
		const path = join(directory, basename(new URL(pathOrUrl).pathname));
		const started = performance.now();
		const response = await fetch(pathOrUrl);
		if (!response.ok || response.body === null) {
			throw new Error(`${pathOrUrl}: HTTP ${response.status}`);
		}
		await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
		log(`downloaded ${pathOrUrl} in ${seconds(started)}`);
		return { path, remove };
	} catch (error) {
		remove();
		throw error;
	}
}

export function log(line: string): void {
	process.stderr.write(`${line}\n`);
}

/** The directory `fetch-dataset` fills, where the deploy's steps after it work by default. */
const FETCHED = join(import.meta.dirname, '../../../web/public/data');

/**
 * The files a step of the deploy after `fetch-dataset` takes, of the paths given (`fetch-dataset`'s directory for
 * none): a file itself, a directory its files `named` and its `places.json` when it holds one (a dataset without places
 * has none, which is no error).
 */
export function fetchedFiles(given: readonly string[], named: readonly string[]): string[] {
	const paths = given.length === 0 ? [FETCHED] : given.map((path) => userPath(path));
	return paths.flatMap((path) => {
		if (!statSync(path).isDirectory()) {
			return [path];
		}
		const files = named.map((name) => join(path, name));
		const places = join(path, 'places.json');
		if (existsSync(places)) {
			files.push(places);
		} else {
			log(`no places file in ${path}`);
		}
		return files;
	});
}

/** The size of a file the screen downloads, as it is and in brotli, as the Worker serves it: `1.83 MB, 0.60 MB in brotli` for the world's cities file. */
export function sizes(text: string, brotli = brotliBytes(text)): string {
	return `${megabytes(Buffer.byteLength(text))} MB, ${megabytes(brotli)} MB in brotli`;
}

/** The size of a text in brotli of quality 11, Node's default, bytes. */
export function brotliBytes(text: string): number {
	return brotliCompressSync(text).length;
}

function megabytes(bytes: number): string {
	return (bytes / 1e6).toFixed(2);
}

export function seconds(started: number): string {
	return `${((performance.now() - started) / 1000).toFixed(1)} s`;
}
