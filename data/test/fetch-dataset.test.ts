// Taking the current dataset out of R2 for the deploy (spec «Набор данных», «Деплой»; #36): the version the pointer
// `current.json` names, each file checked against the pointer's SHA-256 before it takes its place. R2 is a double
// here; the deploy reads R2 itself (cli/fetch-dataset.ts).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DatasetSource, fetchDataset } from '../src/fetch-dataset.ts';

// sha256sum of each text.
const GRAPH = { text: 'RTGRAPH\ngraph bytes', sha256: '0de73e4d4e4c8cbb05718b4b12fd27fb31190e9c3e4043c635266f57401cd0d0' };
const CITIES = { text: '{"format":1,"cities":[]}', sha256: '164478e79b3b149316289102966790c71cba7bf3b8d1ee28ddd19f1d101efdf4' };

/** R2 in memory, holding `objects`, each served in chunks of 4 bytes as Cloudflare's API streams a body. */
function memorySource(objects: Record<string, string>): DatasetSource {
	return {
		async get(key) {
			const text = objects[key];
			if (text === undefined) {
				return undefined;
			}
			const bytes = new TextEncoder().encode(text);
			return (async function* () {
				for (let start = 0; start < bytes.length; start += 4) {
					yield bytes.subarray(start, start + 4);
				}
			})();
		},
	};
}

/** The pointer the world build writes (data/src/publish.ts) for these files of 2026-11-07. */
function pointer(files: Record<string, { text: string; sha256: string }>) {
	return JSON.stringify({
		version: '2026-11-07',
		files: Object.fromEntries(Object.entries(files).map(([name, { text, sha256 }]) => [name, { size: text.length, sha256 }])),
	});
}

const silent = () => {};

describe('taking the current dataset for the deploy', () => {
	let directory: string;
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'roadtrip-deploy-'));
	});
	afterEach(() => {
		rmSync(directory, { recursive: true });
	});

	it('puts each file of the version current.json points at in its place', async () => {
		const r2 = memorySource({
			'current.json': pointer({ 'graph.graph': GRAPH, 'cities.json': CITIES }),
			'2026-11-07/graph.graph': GRAPH.text,
			'2026-11-07/cities.json': CITIES.text,
		});
		const places = { 'graph.graph': join(directory, 'engine/graph.graph'), 'cities.json': join(directory, 'web/data/cities.json') };

		const { version } = await fetchDataset(r2, places, silent);

		expect(version).toBe('2026-11-07');
		expect(readFileSync(places['graph.graph'], 'utf8')).toBe(GRAPH.text);
		expect(readFileSync(places['cities.json'], 'utf8')).toBe(CITIES.text);
	});

	it('puts nothing in place when a file is not the one the pointer names', async () => {
		const r2 = memorySource({
			'current.json': pointer({ 'cities.json': CITIES, 'graph.graph': GRAPH }),
			'2026-11-07/cities.json': CITIES.text,
			// A byte lost on the way.
			'2026-11-07/graph.graph': GRAPH.text.slice(1),
		});
		mkdirSync(join(directory, 'engine'));
		writeFileSync(join(directory, 'engine/graph.graph'), 'the graph of the last deploy');
		const places = { 'cities.json': join(directory, 'web/data/cities.json'), 'graph.graph': join(directory, 'engine/graph.graph') };

		await expect(fetchDataset(r2, places, silent)).rejects.toThrow('2026-11-07/graph.graph');

		expect(readFileSync(places['graph.graph'], 'utf8')).toBe('the graph of the last deploy');
		expect(existsSync(places['cities.json'])).toBe(false);
		expect(readdirSync(join(directory, 'engine'))).toEqual(['graph.graph']);
	});

	it.each([
		['the bucket has no pointer', {}, 'current.json'],
		['the version lacks a file', { 'current.json': pointer({ 'graph.graph': GRAPH }) }, '2026-11-07/graph.graph'],
		['the pointer lists no such file', { 'current.json': pointer({}), '2026-11-07/graph.graph': GRAPH.text }, 'graph.graph'],
	])('fails when %s', async (_, objects: Record<string, string>, message) => {
		const places = { 'graph.graph': join(directory, 'engine/graph.graph') };

		await expect(fetchDataset(memorySource(objects), places, silent)).rejects.toThrow(message);

		expect(existsSync(places['graph.graph'])).toBe(false);
	});
});
