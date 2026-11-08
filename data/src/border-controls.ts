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
	near(lat1: number, lon1: number, lat2: number, lon2: number): boolean {
		const latReach = (BORDER_CROSSING_METERS / METERS_PER_DEGREE) * E7;
		const cos = Math.max(0.01, Math.cos((Math.max(Math.abs(lat1), Math.abs(lat2)) / E7 + latReach / E7) * (Math.PI / 180)));
		const lonReach = latReach / cos;
		for (
			let row = Math.floor((Math.min(lat1, lat2) - latReach) / CELL);
			row <= Math.floor((Math.max(lat1, lat2) + latReach) / CELL);
			row++
		) {
			for (
				let column = Math.floor((Math.min(lon1, lon2) - lonReach) / CELL);
				column <= Math.floor((Math.max(lon1, lon2) + lonReach) / CELL);
				column++
			) {
				const points = this.#cells.get(cellKey(row, column)) ?? [];
				for (let index = 0; index < points.length; index += 2) {
					if (segmentMeters(points[index], points[index + 1], lat1, lon1, lat2, lon2) <= BORDER_CROSSING_METERS) {
						return true;
					}
				}
			}
		}
		return false;
	}
}

function cellKey(row: number, column: number): string {
	return `${row},${column}`;
}
