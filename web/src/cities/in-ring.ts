// Which cities are in the ring (spec #20 «Экран», «Города в кольце»): a city is in it when its point is (the test of
// src/points/ring-test.ts: inside the ring's MultiPolygon, in a zone `access` opens). The origin's city is never one of
// them, at any N (#45): no card, no label on the map, no row of the list of all, and the counts leave it out. In the
// order of the cities given; the ring's points of interest (src/points/in-ring.ts) go by fame.
import type { RingTest } from '../points/ring-test.ts';
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';
import { originCity } from './nearest.ts';

export function citiesInRing(cities: readonly City[], { inside, open }: RingTest, origin: LatLon): City[] {
	const startCity = originCity(cities, origin);
	return cities.filter((city) => city !== startCity && open(city.zone) && inside(city.lat, city.lon));
}
