// The engine server as the Container runs it (`node server/main.ts`): it loads the graph and the border table at
// start, takes connections only then, and calculates with the engine. The queue, `joined` and failures are in
// engine-server.test.ts.
import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { borderTable } from 'rules';
import { afterEach, describe, expect, it } from 'vitest';
import { dataVersion } from '../src/index.ts';
import { createGraph, encodeGraph } from '../src/graph.ts';

const MAIN = fileURLToPath(new URL('main.ts', import.meta.url));
const E7 = 1e7;

/**
 * One country, AAA, from 1°S to 1°N and from 1°W to 3°E, with a road along the equator from 0° to 0.5°E, a node
 * every 0.1°: 11.12 km, 667 s at the wheel at 60 km/h.
 */
function graphFile(): Uint8Array {
	const lons = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
	const from: number[] = [];
	const to: number[] = [];
	for (let node = 0; node + 1 < lons.length; node++) {
		from.push(node, node + 1);
		to.push(node + 1, node);
	}
	const square = [
		[-1, -1],
		[-1, 3],
		[1, 3],
		[1, -1],
		[-1, -1],
	];
	return encodeGraph(
		createGraph({
			nodeLat: new Int32Array(lons.length),
			nodeLon: Int32Array.from(lons, (lon) => Math.round(lon * E7)),
			nodeZone: new Uint8Array(lons.length).fill(1),
			edges: {
				from: Uint32Array.from(from),
				to: Uint32Array.from(to),
				seconds: new Uint16Array(from.length).fill(667),
				borderControl: new Uint8Array(from.length),
			},
			zones: ['', 'AAA'],
			zoneRings: {
				zone: Uint8Array.of(1),
				start: Uint32Array.of(0, square.length),
				lat: Int32Array.from(square, ([lat]) => lat * E7),
				lon: Int32Array.from(square, ([, lon]) => lon * E7),
			},
		}),
	);
}

const cleanups: Array<() => void> = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
});

/** Starts the server on a dataset directory and resolves with its URL once it says it listens. */
async function startMain(dataset: string): Promise<string> {
	const directory = mkdtempSync(join(tmpdir(), 'roadtrip-dataset-'));
	writeFileSync(join(directory, 'graph.graph'), graphFile());
	writeFileSync(join(directory, 'dataset.json'), JSON.stringify({ version: dataset }));
	const server: ChildProcess = spawn(process.execPath, [MAIN], {
		env: { ...process.env, DATASET_DIR: directory, PORT: '0' },
		stdio: ['ignore', 'pipe', 'inherit'],
	});
	cleanups.push(() => {
		server.kill();
		rmSync(directory, { recursive: true, force: true });
	});
	return new Promise((resolve, reject) => {
		let output = '';
		server.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
			output += chunk;
			const port = /listening on port (\d+)/u.exec(output)?.[1];
			if (port !== undefined) {
				resolve(`http://127.0.0.1:${port}`);
			}
		});
		server.once('exit', (code) => {
			reject(new Error(`the server exited with ${code}: ${output}`));
		});
	});
}

describe('the engine server in the Container', () => {
	it('loads the graph and the border table at start and calculates with them', async () => {
		const url = await startMain('2026-11-01');

		const response = await fetch(`${url}/ring`, {
			method: 'POST',
			body: JSON.stringify({ origin: { lat: 0, lon: 0.05 }, lowerHours: 0, upperHours: 1, closedCountries: ['AFG'] }),
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			outcome: 'ring',
			startCountry: 'AAA',
			dataVersion: await dataVersion('2026-11-01', borderTable),
			joined: false,
		});
	});
});
