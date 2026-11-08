// The tiles of the basemap (spec «Экран», «Карта»): the Worker's handler of GET /tiles/{z}/{x}/{y} with its
// dependencies through `deps`. R2 is a double in memory holding a small PMTiles archive the test writes
// (test/pmtiles-archive.ts), whose tiles are strings named after their place; the Cache API is a double too.
import { describe, expect, it } from 'vitest';
import { pmtilesArchive } from '../test/pmtiles-archive.ts';
import { type BasemapBucket, createTilesHandler, type TilesDeps } from './tiles.ts';

const ARCHIVE = '20261107.pmtiles';
const DAY_SECONDS = 24 * 60 * 60;

/** The archive of every test: zooms 0–2 with three tiles; 1/0/1 and every other tile of z2 are absent. */
const FIXTURE = pmtilesArchive(
	[
		{ z: 0, x: 0, y: 0, data: 'tile 0/0/0' },
		{ z: 1, x: 1, y: 0, data: 'tile 1/1/0' },
		{ z: 2, x: 2, y: 1, data: 'tile 2/2/1' },
	],
	{ minZoom: 0, maxZoom: 2 },
);

/** R2 in memory: ranges of the objects it holds, and an object without a body when `etagMatches` fails, as R2. */
class MemoryBucket implements BasemapBucket {
	readonly objects = new Map<string, { data: Uint8Array; etag: string }>();
	reads = 0;

	put(key: string, data: Uint8Array, etag: string): void {
		this.objects.set(key, { data, etag });
	}

	async get(key: string, { range, onlyIf }: Parameters<BasemapBucket['get']>[1]) {
		this.reads++;
		const object = this.objects.get(key);
		if (object === undefined) {
			return null;
		}
		const { etag } = object;
		if (onlyIf.etagMatches !== undefined && onlyIf.etagMatches !== etag) {
			return { etag };
		}
		const bytes = object.data.slice(range.offset, range.offset + range.length);
		return { etag, body: new Blob([bytes]).stream(), arrayBuffer: async () => bytes.buffer };
	}
}

/** The Cache API of one data centre in memory: responses by URL. */
class MemoryCache {
	readonly responses = new Map<string, Response>();

	async match(url: string): Promise<Response | undefined> {
		return this.responses.get(url)?.clone();
	}

	async put(url: string, response: Response): Promise<void> {
		this.responses.set(url, response);
	}
}

/**
 * The handler with its deps: R2 with the fixture as `20261107.pmtiles`, an empty cache. `get` sends a request for
 * `path` (with `archive` as the var, by default the fixture's key) and waits for the handler's background work too.
 */
function tiles() {
	const bucket = new MemoryBucket();
	bucket.put(ARCHIVE, FIXTURE, 'etag-1');
	const cache = new MemoryCache();
	const errors: unknown[][] = [];
	const background: Promise<unknown>[] = [];
	const deps: TilesDeps = {
		bucket,
		archive: ARCHIVE,
		cache,
		waitUntil: (promise) => {
			background.push(promise);
		},
		logger: {
			error: (...args) => {
				errors.push(args);
			},
		},
	};
	const handle = createTilesHandler();
	const get = async (path: string, { archive = ARCHIVE, method = 'GET' }: { archive?: string; method?: string } = {}) => {
		const response = await handle(new Request(`https://roadtrip.kamyshev.me${path}`, { method }), { ...deps, archive });
		await Promise.all(background.splice(0));
		return { status: response.status, headers: response.headers, body: await response.text() };
	};
	return { get, bucket, errors };
}

/** The `max-age` of a Cache-Control header, in seconds. */
function maxAge(headers: Headers): number {
	const match = /max-age=(\d+)/u.exec(headers.get('cache-control') ?? '');
	return match === null ? 0 : Number(match[1]);
}

describe('GET /tiles/{z}/{x}/{y}', () => {
	it('answers the tile of the archive as a vector tile, cached for longer than a day', async () => {
		const { get } = tiles();

		const tile = await get('/tiles/1/1/0');

		expect(tile.status).toBe(200);
		expect(tile.body).toBe('tile 1/1/0');
		expect(tile.headers.get('content-type')).toBe('application/x-protobuf');
		expect(maxAge(tile.headers)).toBeGreaterThan(DAY_SECONDS);
		expect(tile.headers.get('cache-control')).toMatch(/^public,/u);
	});

	it('answers 204 for a tile the archive lacks within its zooms, cached the same', async () => {
		const { get } = tiles();

		const tile = await get('/tiles/1/0/1');

		expect(tile.status).toBe(204);
		expect(tile.body).toBe('');
		expect(maxAge(tile.headers)).toBeGreaterThan(DAY_SECONDS);
	});

	it('answers 404 for a zoom the archive does not have', async () => {
		const { get } = tiles();

		expect((await get('/tiles/3/0/0')).status).toBe(404);
	});

	it('answers a tile again from the cache, without reading the archive', async () => {
		const { get, bucket } = tiles();
		const first = await get('/tiles/2/2/1');
		const reads = bucket.reads;

		const again = await get('/tiles/2/2/1');

		expect(bucket.reads).toBe(reads);
		expect(again).toEqual({ ...first, headers: again.headers });
		expect(Object.fromEntries(again.headers)).toEqual(Object.fromEntries(first.headers));
	});

	it('reads a new archive, not the cache of the old one, once the var names it', async () => {
		const { get, bucket } = tiles();
		bucket.put('20270301.pmtiles', pmtilesArchive([{ z: 1, x: 1, y: 0, data: 'new 1/1/0' }], { minZoom: 0, maxZoom: 2 }), 'etag-2');
		await get('/tiles/1/1/0');

		const tile = await get('/tiles/1/1/0', { archive: '20270301.pmtiles' });

		expect(tile.body).toBe('new 1/1/0');
	});

	it('reads the archive again once it is replaced under the same key', async () => {
		const { get, bucket } = tiles();
		await get('/tiles/0/0/0');
		bucket.put(ARCHIVE, pmtilesArchive([{ z: 1, x: 1, y: 0, data: 'new 1/1/0' }], { minZoom: 0, maxZoom: 2 }), 'etag-2');

		const tile = await get('/tiles/1/1/0');

		expect(tile.body).toBe('new 1/1/0');
	});

	it('answers 500 and reports the error while the archive is not in the bucket, and caches nothing', async () => {
		const { get, bucket, errors } = tiles();

		const missing = await get('/tiles/1/1/0', { archive: '20270301.pmtiles' });
		bucket.put('20270301.pmtiles', FIXTURE, 'etag-2');
		const uploaded = await get('/tiles/1/1/0', { archive: '20270301.pmtiles' });

		expect(missing.status).toBe(500);
		expect(errors).toEqual([['[tiles] the basemap archive is not in the bucket', expect.any(Error), { archive: '20270301.pmtiles' }]]);
		expect(uploaded.body).toBe('tile 1/1/0');
	});

	it('answers 405 to anything but GET', async () => {
		const { get } = tiles();

		const posted = await get('/tiles/1/1/0', { method: 'POST' });

		expect(posted.status).toBe(405);
		expect(posted.headers.get('allow')).toBe('GET');
	});

	it.each(['/tiles/1/0', '/tiles/1/0/0/0', '/tiles/1/0/0.mvt', '/tiles/a/0/0', '/tiles/1/2/0', '/tiles/1/0/2', '/tiles/1/-1/0'])(
		'answers 404 to %s, which is no tile, without reading the archive',
		async (path) => {
			const { get, bucket } = tiles();

			expect((await get(path)).status).toBe(404);
			expect(bucket.reads).toBe(0);
		},
	);
});
