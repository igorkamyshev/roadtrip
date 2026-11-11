// The ring's points of interest (GLOSSARY «Точка интереса», spec #154 «Экран»): its cities but the origin's
// (src/cities/in-ring.ts), the most famous first. What the carousel, the list of all, the map and the events take.
import type { City } from '../cities/cities.ts';
import { citiesInRing, type RingAround } from '../cities/in-ring.ts';
import { cityPoint, mostFamousFirst, type PointOfInterest } from './point-of-interest.ts';

export function pointsInRing(cities: readonly City[], around: RingAround): PointOfInterest[] {
	return citiesInRing(cities, around)
		.map((city) => cityPoint(city))
		.toSorted(mostFamousFirst);
}

/** How many points of interest the ring holds and in how many countries: the first card's numbers, and `ring result`'s. */
export interface PointsCount {
	readonly count: number;
	readonly countries: number;
}

export function countOf(points: readonly PointOfInterest[]): PointsCount {
	return { count: points.length, countries: new Set(points.map((point) => point.zone)).size };
}
