// GET /tiles/{z}/{x}/{y} (spec «Экран», «Карта»): the basemap's vector tiles from the world's PMTiles archive in
// R2, after Protomaps' PMTiles Worker for Cloudflare (PMTiles, serverless/cloudflare). Side effects come through
// `deps`, built at the entry (index.ts).
import type { Logger } from 'error-tracking/logger';
import { EtagMismatch, PMTiles, ResolvedValueCache, type RangeResponse, type Source } from 'pmtiles';

export const TILES_PREFIX = '/tiles/';

/**
 * How long a browser and the Cache API keep a tile: a week. Longer than a day (spec), because R2 answers a miss in
 * 500 ms or more and the tiles of an archive never change. Not longer, because the URL does not name the archive: a
 * browser may show the old archive's tiles for a week after a manual update.
 */
const TILE_CACHE_CONTROL = 'public, max-age=604800';

/** What the route reads of the R2 bucket `roadtrip-basemap`: ranges of the archive, by its etag. */
export interface BasemapBucket {
	readonly get: (
		key: string,
		options: { range: { offset: number; length: number }; onlyIf: { etagMatches?: string } },
	) => Promise<{ etag: string } | { etag: string; body: ReadableStream; arrayBuffer: () => Promise<ArrayBuffer> } | null>;
}

/** The Cache API, by URL. */
export interface TileCache {
	readonly match: (url: string) => Promise<Response | undefined>;
	readonly put: (url: string, response: Response) => Promise<void>;
}

export interface TilesDeps {
	readonly bucket: BasemapBucket;
	/** The archive's key in the bucket (the var `BASEMAP_ARCHIVE`), e.g. `20261107.pmtiles`. */
	readonly archive: string;
	/** The Cache API of the data centre (`caches.default`). */
	readonly cache: TileCache;
	readonly waitUntil: (promise: Promise<unknown>) => void;
	readonly logger: Pick<Logger, 'error'>;
}

/** The handler of the tiles route, with the archive's header and directories kept between its requests. */
export function createTilesHandler(): (request: Request, deps: TilesDeps) => Promise<Response> {
	// The archive's header and directories, kept by the isolate as in Protomaps' Worker.
	const directories = new ResolvedValueCache(25);
	return async (request, deps) => {
		if (request.method !== 'GET') {
			return new Response(null, { status: 405, headers: { allow: 'GET' } });
		}
		const url = new URL(request.url);
		const place = tilePlace(url.pathname);
		if (place === undefined) {
			return new Response('Not found', { status: 404 });
		}
		const { z, x, y } = place;
		// The Cache API's key names the archive, so a new one (a manual update under a new key) misses the old
		// one's tiles. The Cache API is the data centre's own: the first requests in each are slow.
		const key = `${url.origin}${TILES_PREFIX}${z}/${x}/${y}?archive=${encodeURIComponent(deps.archive)}`;
		const cached = await deps.cache.match(key);
		if (cached !== undefined) {
			return cached;
		}
		let response: Response;
		try {
			response = await readTile(new PMTiles(r2Source(deps.bucket, deps.archive), directories), place);
		} catch (error) {
			if (!(error instanceof ArchiveNotFoundError)) {
				throw error;
			}
			// The var names an archive the Owner has not uploaded: every tile fails until it is there. Not cached,
			// so the tiles come as soon as it is.
			deps.logger.error('[tiles] the basemap archive is not in the bucket', error, { archive: deps.archive });
			return new Response('The basemap is missing', { status: 500 });
		}
		deps.waitUntil(deps.cache.put(key, response.clone()));
		return response;
	};
}

class ArchiveNotFoundError extends Error {
	override name = 'ArchiveNotFoundError';
}

/** A tile's place in the archive. */
interface TilePlace {
	readonly z: number;
	readonly x: number;
	readonly y: number;
}

/** The tile from the archive: 200, 204 where the archive has none, 404 at a zoom it does not have. */
async function readTile(archive: PMTiles, { z, x, y }: TilePlace): Promise<Response> {
	const headers = { 'content-type': 'application/x-protobuf', 'cache-control': TILE_CACHE_CONTROL };
	const { minZoom, maxZoom } = await archive.getHeader();
	if (z < minZoom || z > maxZoom) {
		return new Response(null, { status: 404, headers });
	}
	const tile = await archive.getZxy(z, x, y);
	// No tile: nothing there, which MapLibre draws as an empty tile.
	return new Response(tile?.data ?? null, { status: tile === undefined ? 204 : 200, headers });
}

const TILE_PATH = /^\/tiles\/(?<z>\d{1,2})\/(?<x>\d{1,8})\/(?<y>\d{1,8})$/u;

/** The tile a path names, `/tiles/{z}/{x}/{y}` with x and y within z's grid, or undefined for any other path. */
function tilePlace(pathname: string): TilePlace | undefined {
	const groups = TILE_PATH.exec(pathname)?.groups;
	if (groups === undefined) {
		return undefined;
	}
	const [z, x, y] = [Number(groups['z']), Number(groups['x']), Number(groups['y'])];
	const size = 2 ** z;
	return x < size && y < size ? { z, x, y } : undefined;
}

/** The archive in R2 as a source of byte ranges for the PMTiles reader. */
function r2Source(bucket: BasemapBucket, key: string): Source {
	return {
		getKey: () => key,
		// oxlint-disable-next-line max-params -- pmtiles' Source fixes this signature, the etag fourth
		getBytes: async (offset: number, length: number, _signal?: AbortSignal, etag?: string): Promise<RangeResponse> => {
			const object = await bucket.get(key, { range: { offset, length }, onlyIf: { etagMatches: etag } });
			if (object === null) {
				throw new ArchiveNotFoundError(`No ${key} in the bucket`);
			}
			// R2 answers without a body when the etag does not match: the archive was replaced under the same key. The
			// reader then drops what it kept of the old one and reads again.
			if (!('body' in object)) {
				throw new EtagMismatch();
			}
			return { data: await object.arrayBuffer(), etag: object.etag };
		},
	};
}
