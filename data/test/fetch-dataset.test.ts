// Taking the current dataset out of R2 for the deploy (spec #20 «Набор данных», «Деплой»; #36): the version the pointer
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
const PLACES = {
	text: '{"format":1,"places":[[6386,"Блед","Lake Bled",46.36,14.09,90,5,46.37,14.1,"SVN"]]}',
	sha256: '0ee796eac8220946a37ebdc11cb84917ef445b377e8fee64c2a6e80eea6d7828',
};
/** The cells of the outlines as the version holds them (data/src/publish.ts): a line per cell, its name and its file. */
const CELLS = {
	text:
		'44_20\t{"format":1,"outlines":[[1,[44.1,20.1,44.2,20.1,44.2,20.2]]]}\n' +
		'46_14\t{"format":1,"outlines":[[6386,[46.35,14.08,46.37,14.08,46.37,14.11]]]}\n',
	sha256: '563bc3d2efaa7c101fbe3e20a9f446e4c90bc806c2c8851bfa9b2a7273c96ff0',
};

/** The cities and the places in the client's static data, as the deploy places them (cli/fetch-dataset.ts). */
function staticPlaces(directory: string) {
	return {
		'cities.json': join(directory, 'web/data/cities.json'),
		'places.json': join(directory, 'web/data/places.json'),
		'place-outlines.tsv': join(directory, 'web/data/place-outlines'),
	};
}

/** R2 in memory, holding `objects`, each served in chunks of 4 bytes as Cloudflare's API streams a body. */
function memorySource(objects: Readonly<Partial<Record<string, string>>>): DatasetSource {
	return {
		get: (key) => {
			const text = objects[key];
			return Promise.resolve(text === undefined ? undefined : ReadableStream.from(chunks(new TextEncoder().encode(text))));
		},
	};
}

function* chunks(bytes: Uint8Array): Generator<Uint8Array> {
	for (let start = 0; start < bytes.length; start += 4) {
		yield bytes.subarray(start, start + 4);
	}
}

/** The pointer the world build writes (data/src/publish.ts) for these files of 2026-11-07. */
function pointer(files: Record<string, { text: string; sha256: string }>) {
	return JSON.stringify({
		version: '2026-11-07',
		files: Object.fromEntries(Object.entries(files).map(([name, { text, sha256 }]) => [name, { size: Buffer.byteLength(text), sha256 }])),
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

	it('puts the places file beside the cities file, and each cell of the outlines in its own file beside it', async () => {
		const r2 = memorySource({
			'current.json': pointer({ 'cities.json': CITIES, 'places.json': PLACES, 'place-outlines.tsv': CELLS }),
			'2026-11-07/cities.json': CITIES.text,
			'2026-11-07/places.json': PLACES.text,
			'2026-11-07/place-outlines.tsv': CELLS.text,
		});
		mkdirSync(join(directory, 'web/data/place-outlines'), { recursive: true });
		writeFileSync(join(directory, 'web/data/place-outlines/10_10.json'), 'a cell of the last deploy');

		await fetchDataset(r2, staticPlaces(directory), silent);

		expect(readFileSync(join(directory, 'web/data/places.json'), 'utf8')).toBe(PLACES.text);
		expect(readdirSync(join(directory, 'web/data/place-outlines'))).toEqual(['44_20.json', '46_14.json']);
		expect(readFileSync(join(directory, 'web/data/place-outlines/46_14.json'), 'utf8')).toBe(
			'{"format":1,"outlines":[[6386,[46.35,14.08,46.37,14.08,46.37,14.11]]]}',
		);
		expect(readdirSync(join(directory, 'web/data')).toSorted()).toEqual(['cities.json', 'place-outlines', 'places.json']);
	});

	it('takes a version of no cells of the outlines, an empty file of them: the directory of the cells is empty', async () => {
		// sha256sum of no bytes.
		const noCells = { text: '', sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' };
		const r2 = memorySource({
			'current.json': pointer({ 'cities.json': CITIES, 'places.json': PLACES, 'place-outlines.tsv': noCells }),
			'2026-11-07/cities.json': CITIES.text,
			'2026-11-07/places.json': PLACES.text,
			'2026-11-07/place-outlines.tsv': noCells.text,
		});
		mkdirSync(join(directory, 'web/data/place-outlines'), { recursive: true });
		writeFileSync(join(directory, 'web/data/place-outlines/10_10.json'), 'a cell of the last deploy');

		await fetchDataset(r2, staticPlaces(directory), silent);

		expect([
			readFileSync(join(directory, 'web/data/places.json'), 'utf8'),
			readdirSync(join(directory, 'web/data/place-outlines')),
		]).toEqual([PLACES.text, []]);
	});

	it.each([
		['the places file', { '2026-11-07/places.json': PLACES.text.replace('Блед', 'Блэд'), '2026-11-07/place-outlines.tsv': CELLS.text }],
		['the cells of the outlines', { '2026-11-07/places.json': PLACES.text, '2026-11-07/place-outlines.tsv': CELLS.text.slice(0, -2) }],
	])('puts nothing in place when %s is not the one the pointer names', async (what, objects: Record<string, string>) => {
		const r2 = memorySource({
			'current.json': pointer({ 'cities.json': CITIES, 'places.json': PLACES, 'place-outlines.tsv': CELLS }),
			'2026-11-07/cities.json': CITIES.text,
			...objects,
		});

		await expect(fetchDataset(r2, staticPlaces(directory), silent)).rejects.toThrow('SHA-256');

		expect(readdirSync(join(directory, 'web/data'))).toEqual([]);
	});

	it('takes a dataset without places, and leaves the places out', async () => {
		const r2 = memorySource({ 'current.json': pointer({ 'cities.json': CITIES }), '2026-11-07/cities.json': CITIES.text });

		await fetchDataset(r2, staticPlaces(directory), silent);

		expect(readdirSync(join(directory, 'web/data'))).toEqual(['cities.json']);
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
