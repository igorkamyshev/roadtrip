import type { MultiPolygon } from 'engine';

/** Whether the point (degrees) is inside the ring: inside an odd number of its rings, as a map draws it. */
export function ringContains(ring: MultiPolygon, lat: number, lon: number): boolean {
	let inside = false;
	for (const polygon of ring.coordinates) {
		for (const points of polygon) {
			for (let point = 0; point + 1 < points.length; point++) {
				const [lon1, lat1] = points[point];
				const [lon2, lat2] = points[point + 1];
				if (lat1 > lat !== lat2 > lat && lon < lon1 + ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1)) {
					inside = !inside;
				}
			}
		}
	}
	return inside;
}
