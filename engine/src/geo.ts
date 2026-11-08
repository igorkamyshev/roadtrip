/** The mean radius of the Earth (IUGG), in metres: the sphere every distance here is measured on. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Coordinates in the graph are integers in 1e-7 degrees. */
export const E7 = 1e7;

export const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

/** Great-circle distance between two points in degrees, in metres. */
// oxlint-disable-next-line eslint/max-params -- a hot path, per road segment of the builder: an object would be allocated per call (ADR 0002)
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = Math.PI / 180;
	const dLat = (lat2 - lat1) * toRad;
	const dLon = (lon2 - lon1) * toRad;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distance from a point to the segment between two others, all in 1e-7 degrees, in metres; for short ones. */
// oxlint-disable-next-line eslint/max-params -- a hot path, per road segment near a border control: an object would be allocated per call (ADR 0002)
export function segmentMeters(lat: number, lon: number, lat1: number, lon1: number, lat2: number, lon2: number): number {
	const projection = new LocalProjection(lat, lon);
	const ax = projection.x(lon1);
	const ay = projection.y(lat1);
	const dx = projection.x(lon2) - ax;
	const dy = projection.y(lat2) - ay;
	const lengthSquared = dx * dx + dy * dy;
	const fraction = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
	return Math.hypot(ax + fraction * dx, ay + fraction * dy);
}

/** A grid of cells: `rows` rows of `columns` cells from the south-west corner, row by row from the south. */
export interface CellGrid {
	readonly columns: number;
	readonly rows: number;
	/** The south-west corner of cell (0, 0), in 1e-7 degrees. */
	readonly minLat: number;
	readonly minLon: number;
	/** Cell size in 1e-7 degrees. */
	readonly cellLat: number;
	readonly cellLon: number;
}

/**
 * A flat projection in metres around a point, for distances of up to a few hundred kilometres: x east, y north.
 * Takes and gives coordinates in 1e-7 degrees.
 */
export class LocalProjection {
	readonly lat0: number;
	readonly lon0: number;
	readonly metersPerE7Lat = METERS_PER_DEGREE / E7;
	readonly metersPerE7Lon: number;

	constructor(lat0: number, lon0: number) {
		this.lat0 = lat0;
		this.lon0 = lon0;
		this.metersPerE7Lon = this.metersPerE7Lat * Math.max(0.01, Math.cos((lat0 / E7) * (Math.PI / 180)));
	}

	x(lon: number): number {
		return (lon - this.lon0) * this.metersPerE7Lon;
	}

	y(lat: number): number {
		return (lat - this.lat0) * this.metersPerE7Lat;
	}
}
