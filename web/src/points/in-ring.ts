// The ring's points of interest (GLOSSARY «Точка интереса», spec #154 «Экран»): its cities but the origin's
// (src/cities/in-ring.ts) and its places at their access points (src/places/in-ring.ts), by one test of the ring
// (ring-test.ts), in one list, the most famous first. What the carousel, the list of all, the map and the events take.
import type { Place } from 'data/places-file';
import type { City } from '../cities/cities.ts';
import { citiesInRing } from '../cities/in-ring.ts';
import { placesInRing } from '../places/in-ring.ts';
import { CAROUSEL_POINTS } from './carousel.ts';
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

/** The ring's points of interest by kind, as `ring result` counts them: its cities, its places and the carousel's places. */
export interface KindsCount {
	readonly cities: number;
	readonly places: number;
	/** The places among the carousel's cards, the `CAROUSEL_POINTS` first points of interest. */
	readonly carouselPlaces: number;
}

const placesAmong = (points: readonly PointOfInterest[]): number => points.filter((point) => point.kind === 'place').length;

export function kindsOf(points: readonly PointOfInterest[]): KindsCount {
	const places = placesAmong(points);
	return { cities: points.length - places, places, carouselPlaces: placesAmong(points.slice(0, CAROUSEL_POINTS)) };
}
