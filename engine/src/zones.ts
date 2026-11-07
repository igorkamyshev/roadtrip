import type { ZoneRings } from './graph.ts';

/** Edges of a ring per latitude band, so a lookup crosses only the edges at the point's latitude. */
const POINTS_PER_BAND = 16;
const MAX_BANDS = 1024;

interface IndexedRing {
	readonly zone: number;
	readonly minLat: number;
	readonly maxLat: number;
	readonly minLon: number;
	readonly maxLon: number;
	readonly bandHeight: number;
	/** The edges in band b are `bandEdges[bandStart[b]]` … ; an edge is its first point's index. */
	readonly bandStart: Uint32Array;
	readonly bandEdges: Uint32Array;
}

/** Which zone a point is in, by the zone polygons (`ZoneRings`). Shared by the builder and the engine. */
export class ZoneLocator {
	readonly #rings: ZoneRings;
	readonly #indexed: IndexedRing[] = [];
	readonly #parity: Uint8Array;

	constructor(rings: ZoneRings) {
		this.#rings = rings;
		let zoneCount = 0;
		for (let ring = 0; ring < rings.zone.length; ring++) {
			this.#indexed.push(indexRing(rings, ring));
			zoneCount = Math.max(zoneCount, rings.zone[ring] + 1);
		}
		this.#parity = new Uint8Array(zoneCount);
	}

	/** The zone of the point (1e-7 degrees): the lowest zone index whose polygon holds it, or 0 for none. */
	zoneAt(lat: number, lon: number): number {
		const { lat: ringLat, lon: ringLon } = this.#rings;
		const parity = this.#parity;
		parity.fill(0);
		for (const ring of this.#indexed) {
			if (lat < ring.minLat || lat >= ring.maxLat || lon < ring.minLon || lon > ring.maxLon) {
				continue;
			}
			const band = Math.min(ring.bandStart.length - 2, Math.floor((lat - ring.minLat) / ring.bandHeight));
			let crossings = 0;
			for (let slot = ring.bandStart[band]; slot < ring.bandStart[band + 1]; slot++) {
				const point = ring.bandEdges[slot];
				const lat1 = ringLat[point];
				const lat2 = ringLat[point + 1];
				if (lat1 > lat !== lat2 > lat) {
					const lon1 = ringLon[point];
					const crossLon = lon1 + ((ringLon[point + 1] - lon1) * (lat - lat1)) / (lat2 - lat1);
					if (lon < crossLon) {
						crossings++;
					}
				}
			}
			parity[ring.zone] ^= crossings & 1;
		}
		return Math.max(0, parity.indexOf(1));
	}
}

function indexRing(rings: ZoneRings, ring: number): IndexedRing {
	const first = rings.start[ring];
	const last = rings.start[ring + 1] - 1;
	let minLat = Infinity;
	let maxLat = -Infinity;
	let minLon = Infinity;
	let maxLon = -Infinity;
	for (let point = first; point <= last; point++) {
		minLat = Math.min(minLat, rings.lat[point]);
		maxLat = Math.max(maxLat, rings.lat[point]);
		minLon = Math.min(minLon, rings.lon[point]);
		maxLon = Math.max(maxLon, rings.lon[point]);
	}
	const bands = Math.max(1, Math.min(MAX_BANDS, Math.ceil((last - first) / POINTS_PER_BAND)));
	const bandHeight = Math.max(1, (maxLat - minLat) / bands);
	const bandOf = (lat: number) => Math.min(bands - 1, Math.floor((lat - minLat) / bandHeight));
	const counts = new Uint32Array(bands + 1);
	for (let point = first; point < last; point++) {
		const [low, high] = bandRange(rings.lat[point], rings.lat[point + 1], bandOf);
		for (let band = low; band <= high; band++) {
			counts[band + 1]++;
		}
	}
	for (let band = 0; band < bands; band++) {
		counts[band + 1] += counts[band];
	}
	const bandStart = counts.slice();
	const bandEdges = new Uint32Array(counts[bands]);
	for (let point = first; point < last; point++) {
		const [low, high] = bandRange(rings.lat[point], rings.lat[point + 1], bandOf);
		for (let band = low; band <= high; band++) {
			bandEdges[counts[band]++] = point;
		}
	}
	return { zone: rings.zone[ring], minLat, maxLat, minLon, maxLon, bandHeight, bandStart, bandEdges };
}

function bandRange(lat1: number, lat2: number, bandOf: (lat: number) => number): [number, number] {
	return [bandOf(Math.min(lat1, lat2)), bandOf(Math.max(lat1, lat2))];
}
