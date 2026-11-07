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

	/**
	 * The zone of the centre of each cell of a grid, as `zoneAt` gives it, by scanlines: `rows` rows of `columns`
	 * cells from the south-west corner (`minLat`, `minLon`), each `cellLat` by `cellLon` (1e-7 degrees), row by
	 * row from the south.
	 */
	zonesOfCells(minLat: number, minLon: number, cellLat: number, cellLon: number, columns: number, rows: number): Uint8Array {
		const { lat: ringLat, lon: ringLon } = this.#rings;
		const cells = new Uint8Array(columns * rows);
		const maxLat = minLat + rows * cellLat;
		const maxLon = minLon + columns * cellLon;
		const rings = this.#indexed
			.filter((ring) => ring.maxLat > minLat && ring.minLat < maxLat && ring.maxLon > minLon && ring.minLon < maxLon)
			.sort((one, two) => one.zone - two.zone);
		const crossings: number[] = [];
		for (let row = 0; row < rows; row++) {
			const lat = minLat + (row + 0.5) * cellLat;
			// Zone by zone from the lowest, which wins where zones overlap: a cell keeps the first zone that holds it.
			for (let first = 0; first < rings.length; ) {
				const zone = rings[first].zone;
				crossings.length = 0;
				let ringIndex = first;
				for (; ringIndex < rings.length && rings[ringIndex].zone === zone; ringIndex++) {
					const ring = rings[ringIndex];
					if (lat < ring.minLat || lat >= ring.maxLat) {
						continue;
					}
					const band = Math.min(ring.bandStart.length - 2, Math.floor((lat - ring.minLat) / ring.bandHeight));
					for (let slot = ring.bandStart[band]; slot < ring.bandStart[band + 1]; slot++) {
						const point = ring.bandEdges[slot];
						const lat1 = ringLat[point];
						const lat2 = ringLat[point + 1];
						if (lat1 > lat !== lat2 > lat) {
							const lon1 = ringLon[point];
							crossings.push(lon1 + ((ringLon[point + 1] - lon1) * (lat - lat1)) / (lat2 - lat1));
						}
					}
				}
				first = ringIndex;
				crossings.sort((one, two) => one - two);
				// Inside the zone between each odd crossing and the next: an odd number of crossings east of the point.
				for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
					const from = Math.max(0, Math.ceil((crossings[pair] - minLon) / cellLon - 0.5));
					const to = Math.min(columns, Math.ceil((crossings[pair + 1] - minLon) / cellLon - 0.5));
					for (let column = from; column < to; column++) {
						const cell = row * columns + column;
						if (cells[cell] === 0) {
							cells[cell] = zone;
						}
					}
				}
			}
		}
		return cells;
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
