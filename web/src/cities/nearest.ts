// The nearest city of the cities file: the origin's label when it came from geolocation, a link or the saved state
// (spec «Экран»), and the only place the events to PostHog name instead of the origin (spec «Аналитика и ошибки»:
// `start_city`, `start_city_id` and `start_country` are its `name`, `id` and `zone`).
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';

/**
 * The city of `cities` closest to the point by great-circle distance, wherever it is (no limit), with its country
 * as its `zone`; undefined when there are no cities. Of two as close, the one first in `cities` (biggest first).
 */
export function nearestCity(cities: readonly City[], at: LatLon): City | undefined {
	let nearest: City | undefined;
	let nearestDistance = Infinity;
	for (const city of cities) {
		const distance = haversine(at, city);
		if (distance < nearestDistance) {
			nearest = city;
			nearestDistance = distance;
		}
	}
	return nearest;
}

const RADIANS = Math.PI / 180;

/** The haversine of the central angle between two points (degrees): grows with the distance, enough to compare. */
function haversine(one: LatLon, two: LatLon): number {
	const sinLat = Math.sin(((two.lat - one.lat) * RADIANS) / 2);
	const sinLon = Math.sin(((two.lon - one.lon) * RADIANS) / 2);
	return sinLat * sinLat + Math.cos(one.lat * RADIANS) * Math.cos(two.lat * RADIANS) * sinLon * sinLon;
}
