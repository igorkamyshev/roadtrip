import { E7, METERS_PER_DEGREE, segmentMeters } from 'engine/geo';
import { BORDER_CROSSING_METERS } from 'engine/graph';
import type { Tags } from './osm/source.ts';

/** Grid cells of 0.05°, in 1e-7 degrees. */
const CELL = 500_000;

/** Whether an OSM node is a border checkpoint: a border crossing when a road across the border passes it. */
export function isBorderControl(tags: Tags): boolean {
	return tags.barrier === 'border_control';
}

/** The `barrier=border_control` nodes of an extract, found by area. Coordinates in 1e-7 degrees. */
export class BorderControls {
	readonly #cells = new Map<string, number[]>();

	add(lat: number, lon: number): void {
		const key = cellKey(Math.floor(lat / CELL), Math.floor(lon / CELL));
		const points = this.#cells.get(key) ?? [];
		points.push(lat, lon);
		this.#cells.set(key, points);
	}

	/** Whether one lies within BORDER_CROSSING_METERS of the segment between the two points. */
	// oxlint-disable-next-line eslint/max-params -- a segment's ends, for each edge across a border of the world's graph: plain numbers, as the engine's distances take them
	near(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
		const latReach = (BORDER_CROSSING_METERS / METERS_PER_DEGREE) * E7;
		const cos = Math.max(0.01, Math.cos((Math.max(Math.abs(lat1), Math.abs(lat2)) / E7 + latReach / E7) * (Math.PI / 180)));
		const lonReach = latReach / cos;
		const rows = cellSpan(Math.min(lat1, lat2) - latReach, Math.max(lat1, lat2) + latReach);
		const columns = cellSpan(Math.min(lon1, lon2) - lonReach, Math.max(lon1, lon2) + lonReach);
		for (const points of this.#cellsIn(rows, columns)) {
			for (let index = 0; index < points.length; index += 2) {
				if (segmentMeters(points[index], points[index + 1], lat1, lon1, lat2, lon2) <= BORDER_CROSSING_METERS) {
					return true;
				}
			}
		}
		return false;
	}

	/** The points of the cells in the rows and columns, row by row. */
	#cellsIn(rows: CellSpan, columns: CellSpan): (readonly number[])[] {
		const cells: (readonly number[])[] = [];
		for (let row = rows.first; row <= rows.last; row++) {
			for (let column = columns.first; column <= columns.last; column++) {
				const points = this.#cells.get(cellKey(row, column));
				if (points !== undefined) {
					cells.push(points);
				}
			}
		}
		return cells;
	}
}

/** The first and last row (or column) of the cells between two coordinates. */
interface CellSpan {
	readonly first: number;
	readonly last: number;
}

function cellSpan(from: number, to: number): CellSpan {
	return { first: Math.floor(from / CELL), last: Math.floor(to / CELL) };
}

function cellKey(row: number, column: number): string {
	return `${row},${column}`;
}
