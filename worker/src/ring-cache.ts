// The ring cache's key (spec «Кэш колец», #15): the data version, the origin rounded to 0.001°, N and the SHA-256 of
// the sorted closed countries. A calculation gets only these fields, so a ring cached under a key is the ring of
// that key.
import { dataVersion, type LatLon, sha256Hex } from 'engine';
import type { CalculationRequest } from 'engine/protocol';
import { borderTable } from 'rules';

/** 40 days: the graph is rebuilt monthly, so by then no one reads a ring of the old data version. */
export const RING_TTL_SECONDS = 40 * 24 * 60 * 60;

/** Workers KV takes values up to 25 MiB; a bigger ring is served but not cached. */
export const MAX_CACHED_BYTES = 25 * 1024 * 1024;

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
	const closed = await sha256Hex([...new Set(closedCountries)].sort().join(','));
	return `ring:${version}:${origin.lat.toFixed(3)},${origin.lon.toFixed(3)}:${hours}:${closed}`;
}
