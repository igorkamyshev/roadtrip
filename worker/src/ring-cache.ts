// The ring cache (spec #20 «Кэш колец», #15): the rings in KV under a key of the data version, the origin rounded to
// 0.001°, N and the SHA-256 of the sorted closed countries. A calculation gets only these fields, so a ring cached
// under a key is the ring of that key.
import { dataVersion, type LatLon, sha256Hex } from 'engine';
import type { CalculationRequest, RingOutcome } from 'engine/protocol';
import type { LogContext, Logger } from 'error-tracking/logger';
import { borderTable } from 'rules';
import { isRingOutcome } from './container.ts';
import type { Kv } from './kv.ts';

/** 40 days: the graph is rebuilt monthly, so by then no one reads a ring of the old data version. */
const RING_TTL_SECONDS = 40 * 24 * 60 * 60;

/** Workers KV takes values up to 25 MiB; a bigger ring is served but not cached. */
const MAX_CACHED_BYTES = 25 * 1024 * 1024;

/**
 * The origin on the 0.001° grid (~100 m), before it snaps to a road: the cache is read without the Container, and
 * a move of ~80 m changes the ring by seconds. The calculation starts from this point.
 */
export function roundOrigin({ lat, lon }: LatLon): LatLon {
	return { lat: Math.round(lat * 1000) / 1000, lon: Math.round(lon * 1000) / 1000 };
}

const dataVersions = new Map<string, Promise<string>>();

/** The Worker's data version: its dataset's version, the hash of its border table and its ENGINE_VERSION. */
export function workerDataVersion(datasetVersion: string): Promise<string> {
	let version = dataVersions.get(datasetVersion);
	if (version === undefined) {
		version = dataVersion(datasetVersion, borderTable);
		dataVersions.set(datasetVersion, version);
	}
	return version;
}

/**
 * The key of the calculation's ring: `ring:<data version>:<lat>,<lon>:<N>:<SHA-256 of the closed countries, sorted,
 * once each, joined by commas, hex>`. The hash keeps the key within KV's 512 bytes, whatever the number of closed
 * countries; the order and repeats of the set given do not change it.
 */
export async function ringKey(version: string, { origin, hours, closedCountries }: CalculationRequest): Promise<string> {
	const closed = await sha256Hex([...new Set(closedCountries)].toSorted().join(','));
	return `ring:${version}:${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}:${hours}:${closed}`;
}

/** The ring cached under `key`, or undefined on a miss. */
export async function cachedRing(rings: Kv, key: string): Promise<RingOutcome | undefined> {
	const cached = await rings.get(key);
	if (cached === null) {
		return undefined;
	}
	const outcome: unknown = JSON.parse(cached);
	// Only this Worker writes the cache, with an outcome the Container gave: anything else counts as a miss, and the
	// calculation's ring takes its place.
	return isRingOutcome(outcome) ? outcome : undefined;
}

/** A ring to cache: its key, the data versions of the Worker and of the Container that calculated it, the log's context. */
interface RingToCache {
	readonly key: string;
	readonly outcome: RingOutcome;
	readonly version: string;
	readonly calculatedWith: string;
	readonly context: LogContext;
}

/** What caching a ring takes from the handler's deps (ring.ts, `RingDeps`). */
interface RingCacheDeps {
	readonly rings: Kv;
	readonly waitUntil: (promise: Promise<unknown>) => void;
	readonly logger: Pick<Logger, 'error' | 'info'>;
}

/**
 * Writes the ring in the background, unless the Container calculated it with another data version than the
 * Worker's, as in a rollout (an old engine must not put its ring under a new key), or it is too big for KV.
 */
export function cacheRing({ key, outcome, version, calculatedWith, context }: RingToCache, deps: RingCacheDeps): void {
	if (calculatedWith !== version) {
		deps.logger.info('[ring] the Container calculated with another data version: the ring is not cached', {
			worker: version,
			container: calculatedWith,
		});
		return;
	}
	const value = JSON.stringify(outcome);
	const bytes = new TextEncoder().encode(value).byteLength;
	if (bytes > MAX_CACHED_BYTES) {
		deps.logger.info('[ring] the ring is over 25 MiB: not cached', { bytes });
		return;
	}
	deps.waitUntil(
		deps.rings.put(key, value, { expirationTtl: RING_TTL_SECONDS }).catch((error: unknown) => {
			deps.logger.error('[ring] the ring cache did not take the ring', error, context);
		}),
	);
}
