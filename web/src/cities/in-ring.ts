// Which cities are in the ring (spec #20 «Экран», «Города в кольце»): the phone picks them, not the server, since the
// engine's answer is only the ring's outline (#19). A city is in the ring when its point is inside the ring's
// MultiPolygon, its zone is open by `access`, and that zone is not a closed territory (`access` closes those, and a
// zone `access` does not name is not open either). The origin's city is never one of them, at any N (#45): no card,
// no label on the map, no row of the list of all, and the counts leave it out. Biggest first.
import { biggestFirst } from 'data/cities-file';
import type { Access } from 'worker/api';
import type { RingGeometry } from '../map/overlay.ts';
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';
import { originCity } from './nearest.ts';

/** How many cities the ring holds and in how many countries: the first card's numbers, and `ring result`'s. */
export interface CitiesCount {
	readonly count: number;
	readonly countries: number;
	/** PROTOTYPE (#148): how many of `count` are places. */
	readonly places: number;
}

export function countOf(cities: readonly City[]): CitiesCount {
	return {
		count: cities.length,
		countries: new Set(cities.map((city) => city.zone)).size,
		places: cities.filter((city) => city.place !== undefined).length,
	};
}

/** What picks the cities: the ring, the entry modes of its answer, and the origin it was asked from. */
export interface RingAround {
	readonly ring: RingGeometry;
	readonly access: Access;
	readonly origin: LatLon;
}

export function citiesInRing(cities: readonly City[], { ring, access, origin }: RingAround): City[] {
	const inside = ringContains(ring);
	const startCity = originCity(cities, origin);
	return cities
		.filter((city) => {
			// A zone `access` does not name is not open.
			return city !== startCity && city.zone in access && access[city.zone].mode !== 'closed' && inside(city.lat, city.lon);
		})
		.toSorted(biggestFirst);
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
