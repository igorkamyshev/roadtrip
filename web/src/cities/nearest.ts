// The cities around the origin: the nearest one, the only place the events to PostHog name instead of the origin
// (spec «Аналитика и ошибки»: `start_city`, `start_city_id` and `start_country` are its `name`, `id` and `zone`), and
// the origin's city (GLOSSARY «Город точки старта»), which the ring leaves out and the phrase names for geolocation,
// a link or the saved state (#45).
import { cityAround, distanceKm } from 'data/cities-file';
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
		const distance = distanceKm(at, city);
		if (distance < nearestDistance) {
			nearest = city;
			nearestDistance = distance;
		}
	}
	return nearest;
}

/**
 * The origin's city: the city within whose limits the point is, the nearest of several; undefined outside the limits
 * of them all (a village 40 km from Belgrade has none, and Belgrade stays in its ring).
 */
export function originCity(cities: readonly City[], at: LatLon): City | undefined {
	return cityAround(cities, at)?.city;
}
