// The ring's points of interest (GLOSSARY «Точка интереса», spec #154 «Экран»): its cities but the origin's
// (src/cities/in-ring.ts) and its places at their access points (src/places/in-ring.ts), by one test of the ring
// (ring-test.ts), in one list, the most famous first. What the carousel, the list of all, the map and the events take.
import type { Place } from 'data/places-file';
import type { City } from '../cities/cities.ts';
import { citiesInRing } from '../cities/in-ring.ts';
import { placesInRing } from '../places/in-ring.ts';
import { cityPoint, mostFamousFirst, placePoint, type PointOfInterest } from './point-of-interest.ts';
import { ringTest, type RingAround } from './ring-test.ts';

/** What the points of interest are taken from: the cities file's cities, and the places file's places (none without it). */
export interface PointsFiles {
	readonly cities: readonly City[];
	readonly places: readonly Place[];
}

export function pointsInRing({ cities, places }: PointsFiles, around: RingAround): PointOfInterest[] {
	const test = ringTest(around);
	return [
		...citiesInRing(cities, test, around.origin).map((city) => cityPoint(city)),
		...placesInRing(places, test, around.origin).map(({ place, access }) => placePoint(place, access)),
	].toSorted(mostFamousFirst);
}

/** How many points of interest the ring holds and in how many countries: the first card's numbers, and `ring result`'s. */
export interface PointsCount {
	readonly count: number;
	readonly countries: number;
}

export function countOf(points: readonly PointOfInterest[]): PointsCount {
	return { count: points.length, countries: new Set(points.map((point) => point.zone)).size };
}
