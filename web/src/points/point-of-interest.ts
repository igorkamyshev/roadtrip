// The points of interest of a ring (GLOSSARY «Точка интереса», spec #154): what the carousel, the list of all, the map,
// the choice and the events show and count, one list in order of fame. Only the card and a row of the list look at
// what a point is; the rest take its name, fame, country and point. The cities are the only kind until the places.
import { cityFame } from 'data/cities-file';
import type { City } from '../cities/cities.ts';

/** A point of interest of the ring. */
export interface PointOfInterest {
	/** Unique among the points of interest of every kind: the cards, the map's features and the choice name it by it. */
	readonly key: string;
	/** Its id in its own file, GeoNames' for a city: of two as famous, the smaller goes first. */
	readonly id: number;
	/** The Russian name, or the local one where there is no Russian. */
	readonly name: string;
	/** Its fame (GLOSSARY «Известность»), the order of every list of points of interest: the greater, the earlier. */
	readonly fame: number;
	/** Its country on the screen: the zone, as `access` names it (alpha-3, `RKS`, `NX` or a closed territory's code). */
	readonly zone: string;
	/** Where the map shows it and «Маршрут» leads, degrees. */
	readonly lat: number;
	readonly lon: number;
	/** What it is; only the card and a row of the list look at it. */
	readonly kind: 'city';
	readonly city: City;
}

/** A city as a point of interest: its fame by its population (`cityFame`), its zone and its point. */
export function cityPoint(city: City): PointOfInterest {
	const { id, name, zone, lat, lon, population } = city;
	return { key: `city:${id}`, id, name, fame: cityFame(population), zone, lat, lon, kind: 'city', city };
}

/** The most famous first, then the smaller id: for the cities, the biggest first, as the cities file has them. */
export function mostFamousFirst(one: PointOfInterest, two: PointOfInterest): number {
	return one.fame === two.fame ? one.id - two.id : two.fame - one.fame;
}
