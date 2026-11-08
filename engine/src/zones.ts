import type { CellGrid } from './geo.ts';
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

/**
 * The rings by the cells of a grid of whole degrees their bounding boxes cover, so a lookup tries only the rings
 * near the point: the world has thousands of rings, mostly islands.
 */
const GRID_CELL = 10_000_000;

/** Which zone a point is in, by the zone polygons (`ZoneRings`). Shared by the builder and the engine. */
export class ZoneLocator {
	readonly #rings: ZoneRings;
	readonly #indexed: IndexedRing[] = [];
	readonly #parity: Uint8Array;
	readonly #grid: RingGrid;

	constructor(rings: ZoneRings) {
		this.#rings = rings;
		let zoneCount = 0;
		for (let ring = 0; ring < rings.zone.length; ring++) {
			this.#indexed.push(indexRing(rings, ring));
			zoneCount = Math.max(zoneCount, rings.zone[ring] + 1);
		}
		this.#parity = new Uint8Array(zoneCount);
		this.#grid = gridRings(this.#indexed);
	}

	/** The zone of the point (1e-7 degrees): the lowest zone index whose polygon holds it, or 0 for none. */
	zoneAt(lat: number, lon: number): number {
		const grid = this.#grid;
		const row = rowOf(lat) - grid.firstRow;
		const column = columnOf(lon) - grid.firstColumn;
		if (row < 0 || row >= grid.rows || column < 0 || column >= grid.columns) {
			return 0;
		}
		const cell = row * grid.columns + column;
		const parity = this.#parity;
		parity.fill(0);
		for (let slot = grid.cellStart[cell]; slot < grid.cellStart[cell + 1]; slot++) {
			const ring = this.#indexed[grid.cellRings[slot]];
			parity[ring.zone] ^= this.#crossingsEast(ring, lat, lon) & 1;
		}
		return Math.max(0, parity.indexOf(1));
	}

	/**
	 * The zone of the centre of each cell of a grid (1e-7 degrees), as `zoneAt` gives it, by scanlines, row by row
	 * from the south.
	 */
	zonesOfCells(grid: CellGrid): Uint8Array {
		const { minLat, minLon, cellLat, cellLon, columns, rows } = grid;
		const cells = new Uint8Array(columns * rows);
		const maxLat = minLat + rows * cellLat;
		const maxLon = minLon + columns * cellLon;
		// Zone by zone from the lowest, which wins where zones overlap: a cell keeps the first zone that holds it.
		const byZone = Map.groupBy(
			this.#indexed
				.filter((ring) => ring.maxLat > minLat && ring.minLat < maxLat && ring.maxLon > minLon && ring.minLon < maxLon)
				.toSorted((one, two) => one.zone - two.zone),
			(ring) => ring.zone,
		);
		const crossings: number[] = [];
		/** Inside the zone between each odd crossing and the next: an odd number of crossings east of the point. */
		const fillRow = (row: number, zone: number) => {
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
		};
		for (let row = 0; row < rows; row++) {
			const lat = minLat + (row + 0.5) * cellLat;
			for (const [zone, rings] of byZone) {
				this.#crossingsAt(rings, lat, crossings);
				crossings.sort((one, two) => one - two);
				fillRow(row, zone);
			}
		}
		return cells;
	}

	/** How many edges of the ring cross the point's latitude east of it; 0 when the point is outside its box. */
	#crossingsEast(ring: IndexedRing, lat: number, lon: number): number {
		if (lat < ring.minLat || lat >= ring.maxLat || lon < ring.minLon || lon > ring.maxLon) {
			return 0;
		}
		const band = bandAt(ring, lat);
		let crossings = 0;
		for (let slot = ring.bandStart[band]; slot < ring.bandStart[band + 1]; slot++) {
			const crossLon = crossingLon(this.#rings, ring.bandEdges[slot], lat);
			if (crossLon !== undefined && lon < crossLon) {
				crossings++;
			}
		}
		return crossings;
	}

	/** The longitudes where the edges of the rings cross the latitude, in `crossings`, which they replace. */
	#crossingsAt(rings: readonly IndexedRing[], lat: number, crossings: number[]): void {
		crossings.length = 0;
		for (const ring of rings) {
			if (lat < ring.minLat || lat >= ring.maxLat) {
				continue;
			}
			const band = bandAt(ring, lat);
			for (let slot = ring.bandStart[band]; slot < ring.bandStart[band + 1]; slot++) {
				const crossLon = crossingLon(this.#rings, ring.bandEdges[slot], lat);
				if (crossLon !== undefined) {
					crossings.push(crossLon);
				}
			}
		}
	}
}

/** The band of the ring at the latitude; the last band holds its northernmost edge too. */
function bandAt(ring: IndexedRing, lat: number): number {
	return Math.min(ring.bandStart.length - 2, Math.floor((lat - ring.minLat) / ring.bandHeight));
}

/** The longitude where the ring edge from `point` to the next point crosses the latitude; undefined where it does not. */
function crossingLon(rings: ZoneRings, point: number, lat: number): number | undefined {
	const lat1 = rings.lat[point];
	const lat2 = rings.lat[point + 1];
	if (lat1 > lat === lat2 > lat) {
		return undefined;
	}
	const lon1 = rings.lon[point];
	return lon1 + ((rings.lon[point + 1] - lon1) * (lat - lat1)) / (lat2 - lat1);
}

interface RingGrid {
	readonly firstRow: number;
	readonly firstColumn: number;
	readonly rows: number;
	readonly columns: number;
	/** The rings whose bounding box covers cell c are `cellRings[cellStart[c]]` … ; cells row by row. */
	readonly cellStart: Uint32Array;
	readonly cellRings: Uint32Array;
}

function rowOf(lat: number): number {
	return Math.floor(lat / GRID_CELL);
}

function columnOf(lon: number): number {
	return Math.floor(lon / GRID_CELL);
}

function gridRings(rings: readonly IndexedRing[]): RingGrid {
	if (rings.length === 0) {
		return { firstRow: 0, firstColumn: 0, rows: 0, columns: 0, cellStart: new Uint32Array(1), cellRings: new Uint32Array(0) };
	}
	// Loops, not Math.min(...): the world's rings can outgrow the argument limit.
	let [firstRow, firstColumn, lastRow, lastColumn] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const ring of rings) {
		firstRow = Math.min(firstRow, rowOf(ring.minLat));
		firstColumn = Math.min(firstColumn, columnOf(ring.minLon));
		lastRow = Math.max(lastRow, rowOf(ring.maxLat));
		lastColumn = Math.max(lastColumn, columnOf(ring.maxLon));
	}
	const rows = lastRow - firstRow + 1;
	const columns = lastColumn - firstColumn + 1;
	const eachCell = (ring: IndexedRing, visit: (cell: number) => void) => {
		for (let row = rowOf(ring.minLat) - firstRow; row <= rowOf(ring.maxLat) - firstRow; row++) {
			for (let column = columnOf(ring.minLon) - firstColumn; column <= columnOf(ring.maxLon) - firstColumn; column++) {
				visit(row * columns + column);
			}
		}
	};
	const cellStart = new Uint32Array(rows * columns + 1);
	for (const ring of rings) {
		eachCell(ring, (cell) => {
			cellStart[cell + 1]++;
		});
	}
	for (let cell = 0; cell < rows * columns; cell++) {
		cellStart[cell + 1] += cellStart[cell];
	}
	const cellRings = new Uint32Array(cellStart[rows * columns]);
	const fill = cellStart.slice(0, rows * columns);
	rings.forEach((ring, index) => {
		eachCell(ring, (cell) => {
			cellRings[fill[cell]++] = index;
		});
	});
	return { firstRow, firstColumn, rows, columns, cellStart, cellRings };
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
	// Each edge in every band its latitudes span, from its first point.
	const eachEdgeBand = (visit: (point: number, band: number) => void) => {
		for (let point = first; point < last; point++) {
			const lat1 = rings.lat[point];
			const lat2 = rings.lat[point + 1];
			const high = bandOf(Math.max(lat1, lat2));
			for (let band = bandOf(Math.min(lat1, lat2)); band <= high; band++) {
				visit(point, band);
			}
		}
	};
	const counts = new Uint32Array(bands + 1);
	eachEdgeBand((_, band) => {
		counts[band + 1]++;
	});
	for (let band = 0; band < bands; band++) {
		counts[band + 1] += counts[band];
	}
	const bandStart = counts.slice();
	const bandEdges = new Uint32Array(counts[bands]);
	eachEdgeBand((point, band) => {
		bandEdges[counts[band]++] = point;
	});
	return { zone: rings.zone[ring], minLat, maxLat, minLon, maxLon, bandHeight, bandStart, bandEdges };
}
