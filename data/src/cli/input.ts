import { createWriteStream, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
export async function withLocalFile<T>(pathOrUrl: string, use: (path: string) => T): Promise<T> {
	if (!/^https?:\/\//u.test(pathOrUrl)) {
		return use(userPath(pathOrUrl));
	}
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-'));
	try {
		const path = join(directory, basename(new URL(pathOrUrl).pathname));
		const started = performance.now();
		const response = await fetch(pathOrUrl);
		if (!response.ok || response.body === null) {
			throw new Error(`${pathOrUrl}: HTTP ${response.status}`);
		}
		await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(path));
		log(`downloaded ${pathOrUrl} in ${seconds(started)}`);
		return use(path);
	} finally {
		rmSync(directory, { recursive: true, force: true });
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
			(report.incompleteZones.length > 0 ? `; left out, as the extract holds only part of them: ${report.incompleteZones.join(', ')}` : ''),
	);
	return { graph, report };
}

export function log(line: string): void {
	process.stderr.write(`${line}\n`);
}

export function seconds(started: number): string {
	return `${((performance.now() - started) / 1000).toFixed(1)} s`;
}
