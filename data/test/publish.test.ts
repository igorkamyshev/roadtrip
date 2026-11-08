// Putting the dataset in R2 (spec «Набор данных», «Выкладка»): every file under its version, and the pointer to the
// current version moved only once they are all there. R2 is a double here; the world build talks to R2 itself.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COUNTRIES } from 'rules/countries';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DatasetStore, publishDataset } from '../src/publish.ts';
import { ZONELESS_COUNTRIES } from '../src/zoneless.ts';

/** zones.json with an outline of each zone, empty: the zones are what publishing checks. */
function outlines(zones: readonly string[]): string {
	const features = zones.map((zone) => ({ type: 'Feature', properties: { zone }, geometry: { type: 'MultiPolygon', coordinates: [] } }));
	return JSON.stringify({ type: 'FeatureCollection', features });
}

/** The zones of a world dataset: every country of COUNTRIES that has one, and zones of #13, which are no country. */
const WORLD_ZONES = [...Object.keys(COUNTRIES).filter((code) => !ZONELESS_COUNTRIES.has(code)), 'ABKHAZIA', 'CRIMEA'];

/** R2 in memory; `broken` makes an upload of that key fail, `truncated` store it a byte short. */
function memoryStore(options: { broken?: string; truncated?: string } = {}) {
	const objects = new Map<string, Uint8Array>();
	const writes: string[] = [];
	const store: DatasetStore = {
		async upload(key, path) {
			if (key === options.broken) {
				throw new Error(`network error uploading ${key}`);
			}
			const bytes = readFileSync(path);
			objects.set(key, key === options.truncated ? bytes.subarray(1) : bytes);
			writes.push(key);
		},
		async size(key) {
			return objects.get(key)?.length;
		},
		async read(key) {
			const bytes = objects.get(key);
			return bytes === undefined ? undefined : new TextDecoder().decode(bytes);
		},
		async write(key, text) {
			objects.set(key, new TextEncoder().encode(text));
			writes.push(key);
		},
	};
	const text = (key: string) => new TextDecoder().decode(objects.get(key));
	return { store, objects, writes, text };
}

const silent = () => {};

describe('publishing a dataset', () => {
	let directory: string;
	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), 'roadtrip-dataset-'));
		writeFileSync(join(directory, 'graph.graph'), 'RTGRAPH\ngraph bytes');
		writeFileSync(join(directory, 'zones.json'), outlines(WORLD_ZONES));
		writeFileSync(join(directory, 'cities.json'), '{"format":1,"cities":[]}');
		writeFileSync(join(directory, 'dataset.json'), '{ "version": "2026-11-07" }\n');
		writeFileSync(join(directory, 'report.md'), '## Граф дорог\n');
	});
	afterEach(() => rmSync(directory, { recursive: true }));

	it('uploads every file under its version, then points current.json at it', async () => {
		const r2 = memoryStore();

		await publishDataset(r2.store, directory, silent);

		expect(r2.writes).toEqual([
			'2026-11-07/graph.graph',
			'2026-11-07/zones.json',
			'2026-11-07/cities.json',
			'2026-11-07/dataset.json',
			'2026-11-07/report.md',
			'2026-11-07/manifest.json',
			'current.json',
		]);
		expect(r2.text('2026-11-07/graph.graph')).toBe('RTGRAPH\ngraph bytes');
		expect(JSON.parse(r2.text('current.json'))).toEqual({
			version: '2026-11-07',
			files: {
				'graph.graph': { size: 19, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
				'zones.json': { size: outlines(WORLD_ZONES).length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
				'cities.json': { size: 24, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
				'dataset.json': { size: 28, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
				'report.md': { size: 23, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) },
			},
		});
		expect(r2.text('2026-11-07/manifest.json')).toBe(r2.text('current.json'));
	});

	it("gives each file's SHA-256, for the deploy to check what it downloads", async () => {
		const r2 = memoryStore();

		await publishDataset(r2.store, directory, silent);

		// sha256sum of 'RTGRAPH\ngraph bytes'.
		expect(JSON.parse(r2.text('current.json')).files['graph.graph'].sha256).toBe('0de73e4d4e4c8cbb05718b4b12fd27fb31190e9c3e4043c635266f57401cd0d0');
	});

	it.each([
		['an upload fails', { broken: '2026-11-07/cities.json' }, 'network error'],
		['an uploaded file comes out another size', { truncated: '2026-11-07/graph.graph' }, 'graph.graph'],
	])('leaves the pointer at the version before when %s', async (_, options, message) => {
		const r2 = memoryStore(options);
		await r2.store.write('current.json', '{"version":"2026-10-01","files":{}}');

		await expect(publishDataset(r2.store, directory, silent)).rejects.toThrow(message);

		expect(JSON.parse(r2.text('current.json')).version).toBe('2026-10-01');
	});

	it('publishes the same files under their version again, as a rerun does', async () => {
		const r2 = memoryStore();
		await publishDataset(r2.store, directory, silent);
		await r2.store.write('current.json', '{"version":"2026-10-01","files":{}}');

		await publishDataset(r2.store, directory, silent);

		expect(JSON.parse(r2.text('current.json')).version).toBe('2026-11-07');
	});

	it('uploads nothing over a version published with other files, and says to take a new one', async () => {
		const r2 = memoryStore();
		await publishDataset(r2.store, directory, silent);
		writeFileSync(join(directory, 'cities.json'), '{"format":1,"cities":[[1,"Подгорица","Podgorica",42.4,19.3,150977,"MNE"]]}');
		r2.writes.length = 0;

		await expect(publishDataset(r2.store, directory, silent)).rejects.toThrow(/cities\.json.*new version/su);

		expect(r2.writes).toEqual([]);
		expect(r2.text('2026-11-07/cities.json')).toBe('{"format":1,"cities":[]}');
	});

	it.each([
		['a file is missing', () => rmSync(join(directory, 'cities.json')), 'cities.json'],
		['dataset.json names no version', () => writeFileSync(join(directory, 'dataset.json'), '{}'), 'version'],
		[
			'countries that have a zone in the world have none',
			() => writeFileSync(join(directory, 'zones.json'), outlines(WORLD_ZONES.filter((zone) => zone !== 'USA' && zone !== 'NX'))),
			'no zone for NX, USA',
		],
	])('uploads nothing when %s', async (_, spoil, message) => {
		spoil();
		const r2 = memoryStore();

		await expect(publishDataset(r2.store, directory, silent)).rejects.toThrow(message);

		expect(r2.writes).toEqual([]);
	});

	it('takes a trial without the zones of the parts of the world it leaves out', async () => {
		writeFileSync(join(directory, 'zones.json'), outlines(['AND', 'ESP', 'FRA', 'PRT']));
		const r2 = memoryStore();

		await publishDataset(r2.store, directory, silent, { trial: true });

		expect(JSON.parse(r2.text('current.json')).version).toBe('2026-11-07');
	});
});

describe('the countries without a zone in the world', () => {
	it('are countries of COUNTRIES', () => {
		expect([...ZONELESS_COUNTRIES].filter((code) => !(code in COUNTRIES))).toEqual([]);
	});
});
