// The zone of every road node of an extract, the world's ~360 M included (#35), without a polygon test for each:
// a node in a cell of a fine grid that no zone boundary crosses has the zone of the cell, looked up once; only a
// node in a cell a boundary crosses asks the zone polygons.
import type { ZoneLocator, ZoneRings } from 'engine/graph';

/** Cells of 0.05° (~5.5 km), in 1e-7 degrees: the world is 3 600 × 7 200 cells, 52 MB. */
const CELL = 500_000;
/** A cell a boundary crosses. */
const CROSSED = 0xffff;
/** A cell whose zone is not looked up yet. */
const UNKNOWN = 0xfffe;

/** The zone of a point as `ZoneLocator.zoneAt` gives it, by the cells of a grid. */
export class ZoneCells {
	readonly #locator: ZoneLocator;
	readonly #firstRow: number;
	readonly #firstColumn: number;
	readonly #rows: number;
	readonly #columns: number;
	readonly #cells: Uint16Array;

	constructor(locator: ZoneLocator, rings: ZoneRings) {
		this.#locator = locator;
		let [minLat, minLon, maxLat, maxLon] = [Infinity, Infinity, -Infinity, -Infinity];
		for (let point = 0; point < rings.lat.length; point++) {
			minLat = Math.min(minLat, rings.lat[point]);
			maxLat = Math.max(maxLat, rings.lat[point]);
			minLon = Math.min(minLon, rings.lon[point]);
			maxLon = Math.max(maxLon, rings.lon[point]);
		}
		const empty = rings.lat.length === 0;
		this.#firstRow = empty ? 0 : Math.floor((minLat - 1) / CELL);
		this.#firstColumn = empty ? 0 : Math.floor((minLon - 1) / CELL);
		this.#rows = empty ? 0 : Math.floor((maxLat + 1) / CELL) - this.#firstRow + 1;
		this.#columns = empty ? 0 : Math.floor((maxLon + 1) / CELL) - this.#firstColumn + 1;
		this.#cells = new Uint16Array(this.#rows * this.#columns).fill(UNKNOWN);
		for (let ring = 0; ring < rings.zone.length; ring++) {
			for (let point = rings.start[ring]; point < rings.start[ring + 1] - 1; point++) {
				this.#cross(rings, point);
			}
		}
	}

	zoneAt(lat: number, lon: number): number {
		const row = Math.floor(lat / CELL) - this.#firstRow;
		const column = Math.floor(lon / CELL) - this.#firstColumn;
		if (row < 0 || row >= this.#rows || column < 0 || column >= this.#columns) {
			return this.#locator.zoneAt(lat, lon);
		}
		const cell = row * this.#columns + column;
		const value = this.#cells[cell];
		if (value === CROSSED) {
			return this.#locator.zoneAt(lat, lon);
		}
		if (value === UNKNOWN) {
			// No boundary crosses the cell, its edges included: all of it is in the zone of its centre.
			const zone = this.#locator.zoneAt((this.#firstRow + row) * CELL + CELL / 2, (this.#firstColumn + column) * CELL + CELL / 2);
			this.#cells[cell] = zone;
			return zone;
		}
		return value;
	}

	/**
	 * Marks the cells the boundary edge from point `point` of the rings to the next touches, and more: the edge in
	 * steps of at most half a cell, each marking the cells of its box widened by a unit, so an edge along a grid line
	 * marks both sides.
	 */
	#cross(rings: ZoneRings, point: number): void {
		const lat1 = rings.lat[point];
		const lon1 = rings.lon[point];
		const lat2 = rings.lat[point + 1];
		const lon2 = rings.lon[point + 1];
		const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lat2 - lat1), Math.abs(lon2 - lon1)) / (CELL / 2)));
		for (let step = 0; step < steps; step++) {
			const fromLat = lat1 + ((lat2 - lat1) * step) / steps;
			const toLat = lat1 + ((lat2 - lat1) * (step + 1)) / steps;
			const fromLon = lon1 + ((lon2 - lon1) * step) / steps;
			const toLon = lon1 + ((lon2 - lon1) * (step + 1)) / steps;
			const lastRow = Math.floor((Math.max(fromLat, toLat) + 1) / CELL) - this.#firstRow;
			const lastColumn = Math.floor((Math.max(fromLon, toLon) + 1) / CELL) - this.#firstColumn;
			for (let row = Math.floor((Math.min(fromLat, toLat) - 1) / CELL) - this.#firstRow; row <= lastRow; row++) {
				for (let column = Math.floor((Math.min(fromLon, toLon) - 1) / CELL) - this.#firstColumn; column <= lastColumn; column++) {
					this.#cells[row * this.#columns + column] = CROSSED;
				}
			}
		}
	}
}
