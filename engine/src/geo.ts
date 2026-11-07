/** The mean radius of the Earth (IUGG), in metres: the sphere every distance here is measured on. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Coordinates in the graph are integers in 1e-7 degrees. */
export const E7 = 1e7;

export const METERS_PER_DEGREE = (EARTH_RADIUS_M * Math.PI) / 180;

/** Great-circle distance between two points in degrees, in metres. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const toRad = Math.PI / 180;
	const dLat = (lat2 - lat1) * toRad;
	const dLon = (lon2 - lon1) * toRad;
	const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
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
