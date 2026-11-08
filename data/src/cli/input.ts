import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { decodeGraph, type Graph } from 'engine/graph';
import { type BuildReport, buildGraph } from '../build-graph.ts';
import { openOsm } from '../osm/open.ts';

/**
 * A path as the person typed it: `pnpm --filter data <command>` runs in data/, so a relative path is taken from
 * where pnpm was started.
 */
export function userPath(path: string): string {
	return resolve(process.env.INIT_CWD ?? process.cwd(), path);
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
 * The lines of a text file, a path or a URL: as it is, or `<name>.txt` inside `<name>.zip`, as GeoNames packs its
 * dumps (`cities1000.zip`, `alternateNamesV2.zip`, `alternatenames/RS.zip`), streamed out of the archive by `unzip`.
 */
export async function* fileLines(pathOrUrl: string): AsyncGenerator<string> {
	const copy = await localCopy(pathOrUrl);
	const unzip = copy.path.endsWith('.zip')
		? spawn('unzip', ['-p', copy.path, `${basename(copy.path, '.zip')}.txt`], { stdio: ['ignore', 'pipe', 'inherit'] })
		: undefined;
	try {
		const exited = unzip === undefined ? undefined : once(unzip, 'close');
		yield* createInterface({ input: unzip?.stdout ?? createReadStream(copy.path), crlfDelay: Infinity });
		const [code] = (await exited) ?? [0];
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
		await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(path));
		log(`downloaded ${pathOrUrl} in ${seconds(started)}`);
		return { path, remove };
	} catch (error) {
		remove();
		throw error;
	}
}

/** The graph in a graph file (`.graph`), or built from an OSM extract. */
export function loadGraph(path: string): { graph: Graph; report?: BuildReport } {
	const started = performance.now();
	if (path.endsWith('.graph')) {
		const graph = decodeGraph(readFileSync(path));
		log(`read ${path} in ${seconds(started)}: ${graph.nodeLat.length} nodes, ${graph.edgeTarget.length} edges`);
		return { graph };
	}
	const { graph, report } = buildGraph(openOsm(path));
	log(
		`built the graph of ${path} in ${seconds(started)}: ${report.roadWays} road ways, ${report.nodes} nodes, ${report.edges} edges; ` +
			`zones ${report.zones.join(', ') || 'none'}` +
			(report.partialZones.length > 0 ? `; kept without the rings the extract holds only in part: ${report.partialZones.join(', ')}` : '') +
			(report.incompleteZones.length > 0
				? `; left out, as the extract holds no whole ring of them but holes: ${report.incompleteZones.join(', ')}`
				: ''),
	);
	const { pairsWithoutCrossings, crossingsNotFound } = report.borders;
	if (pairsWithoutCrossings.length > 0) {
		log(
			'pairs with passport control and no border crossing on their roads (add their crossings to the border table): ' +
				pairsWithoutCrossings.map(({ pair, edges }) => `${pair} (${edges} edges)`).join(', '),
		);
	}
	if (crossingsNotFound.length > 0) {
		log(`open crossings of the border table near no road across their border: ${crossingsNotFound.join(', ')}`);
	}
	return { graph, report };
}

export function log(line: string): void {
	process.stderr.write(`${line}\n`);
}

export function seconds(started: number): string {
	return `${((performance.now() - started) / 1000).toFixed(1)} s`;
}
