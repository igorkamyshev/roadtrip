// Which cities are in the ring (spec «Экран», «Города в кольце»): the phone picks them, not the server, since the
// engine's answer is only the ring's outline (#19). A city is in the ring when its point is inside the ring's
// MultiPolygon, its zone is open by `access`, and that zone is not a closed territory (`access` closes those, and a
// zone `access` does not name is not open either). Biggest first.
import type { Access } from 'worker/api';
import type { RingGeometry } from '../map/overlay.ts';
import type { City } from './cities.ts';

export function citiesInRing(cities: readonly City[], ring: RingGeometry, access: Access): City[] {
	const inside = ringContains(ring);
	return cities
		.filter((city) => {
			const entry = access[city.zone];
			return entry !== undefined && entry.mode !== 'closed' && inside(city.lat, city.lon);
		})
		.sort((one, two) => two.population - one.population || one.id - two.id);
}

/** The ring's edges per latitude band, so that a point crosses only the edges at its latitude: rings have 10⁵ points. */
const POINTS_PER_BAND = 16;
const MAX_BANDS = 4096;

/**
 * Whether a point (degrees) is inside the ring: inside an odd number of its rings, outer and holes alike, as the map
 * fills it. The engine's polygons do not overlap.
 */
function ringContains(ring: RingGeometry): (lat: number, lon: number) => boolean {
	const lon1: number[] = [];
	const lat1: number[] = [];
	const lon2: number[] = [];
	const lat2: number[] = [];
	let south = Infinity;
	let north = -Infinity;
	let west = Infinity;
	let east = -Infinity;
	for (const polygon of ring.coordinates) {
		for (const points of polygon) {
			for (let point = 0; point + 1 < points.length; point++) {
				const [fromLon, fromLat] = points[point];
				const [toLon, toLat] = points[point + 1];
				lon1.push(fromLon);
				lat1.push(fromLat);
				lon2.push(toLon);
				lat2.push(toLat);
				south = Math.min(south, fromLat);
				north = Math.max(north, fromLat);
				west = Math.min(west, fromLon);
				east = Math.max(east, fromLon);
			}
		}
	}
	const bands = Math.max(1, Math.min(MAX_BANDS, Math.ceil(lat1.length / POINTS_PER_BAND)));
	const height = (north - south) / bands || 1;
	const bandOf = (lat: number) => Math.min(bands - 1, Math.max(0, Math.floor((lat - south) / height)));
	const edges: number[][] = Array.from({ length: bands }, () => []);
	for (let edge = 0; edge < lat1.length; edge++) {
		const low = bandOf(Math.min(lat1[edge], lat2[edge]));
		const high = bandOf(Math.max(lat1[edge], lat2[edge]));
		for (let band = low; band <= high; band++) {
			edges[band].push(edge);
		}
	}
	return (lat, lon) => {
		if (lat < south || lat > north || lon < west || lon > east) {
			return false;
		}
		let inside = false;
		for (const edge of edges[bandOf(lat)]) {
			if (lat1[edge] > lat !== lat2[edge] > lat && lon < lon1[edge] + ((lon2[edge] - lon1[edge]) * (lat - lat1[edge])) / (lat2[edge] - lat1[edge])) {
				inside = !inside;
			}
		}
		return inside;
	};
}
