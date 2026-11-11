// Whether a point is in the ring (spec #20 «Экран», «Города в кольце»; spec #154 «Отбор мест кольца»): the phone
// decides, not the server, since the engine's answer is only the ring's outline (#19). A point is in it when it is
// inside the ring's MultiPolygon and its zone is open by `access`; a zone `access` does not name is not open, nor is a
// closed territory (`access` closes those). The same test for a city's point and a place's access points.
import type { Access } from 'worker/api';
import type { RingGeometry } from '../map/overlay.ts';
import type { LatLon } from '../state/point.ts';

/** What picks the ring's points of interest: the ring, the entry modes of its answer, and the origin it was asked from. */
export interface RingAround {
	readonly ring: RingGeometry;
	readonly access: Access;
	readonly origin: LatLon;
}

/** The test of a point, built once for a ring: whether a point (degrees) is inside it, and whether a zone is open. */
export interface RingTest {
	readonly inside: (lat: number, lon: number) => boolean;
	readonly open: (zone: string) => boolean;
}

export function ringTest({ ring, access }: Pick<RingAround, 'ring' | 'access'>): RingTest {
	return { inside: ringContains(ring), open: (zone) => zone in access && access[zone].mode !== 'closed' };
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
	// A band's height; any for a ring of no height.
	const span = (north - south) / bands;
	const height = span > 0 ? span : 1;
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
			if (
				lat1[edge] > lat !== lat2[edge] > lat &&
				lon < lon1[edge] + ((lon2[edge] - lon1[edge]) * (lat - lat1[edge])) / (lat2[edge] - lat1[edge])
			) {
				inside = !inside;
			}
		}
		return inside;
	};
}
