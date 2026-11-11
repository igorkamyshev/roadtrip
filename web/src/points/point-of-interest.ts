// The points of interest of a ring (GLOSSARY «Точка интереса», spec #154): what the carousel, the list of all, the map,
// the choice and the events show and count, one list in order of fame, cities and places alike. Only the card and a
// row of the list look at what a point is; the rest take its name, fame, country and point.
import { cityFame, placeFame, type AccessPoint, type Place } from 'data/places-file';
import type { City } from '../cities/cities.ts';

/** What every point of interest has, whatever its kind. */
interface PointBase {
	/** Unique among the points of interest of every kind: the cards, the map's features and the choice name it by it. */
	readonly key: string;
	/** Its id in its own file, GeoNames' for a city, Wikidata's Q-id for a place: of two as famous, the smaller goes first. */
	readonly id: number;
	/** The Russian name, or the local one where there is no Russian. */
	readonly name: string;
	/** Its fame (GLOSSARY «Известность»), the order of every list of points of interest: the greater, the earlier. */
	readonly fame: number;
	/**
	 * Its country on the screen: the zone, as `access` names it (alpha-3, `RKS`, `NX` or a closed territory's code); a
	 * place's is its access point's in this ring.
	 */
	readonly zone: string;
	/** Where the map shows it and «Маршрут» leads, degrees: a place's access point in this ring. */
	readonly lat: number;
	readonly lon: number;
}

/** A point of interest of the ring: a city or a place. Only the card and a row of the list look at `kind`. */
export type PointOfInterest =
	| (PointBase & { readonly kind: 'city'; readonly city: City })
	| (PointBase & { readonly kind: 'place'; readonly place: Place });

/** A city as a point of interest: its fame by its population (`cityFame`), its zone and its point. */
export function cityPoint(city: City): PointOfInterest {
	const { id, name, zone, lat, lon, population } = city;
	return { key: `city:${id}`, id, name, fame: cityFame(population), zone, lat, lon, kind: 'city', city };
}

/**
 * A place as a point of interest at its access point in the ring: its fame by its sitelinks (`placeFame`), its Russian
 * name or else its other one, and the access point's zone and point.
 */
export function placePoint(place: Place, { lat, lon, zone }: AccessPoint): PointOfInterest {
	const { qid, ru, local, sitelinks } = place;
	return { key: `place:Q${qid}`, id: qid, name: ru === '' ? local : ru, fame: placeFame(sitelinks), zone, lat, lon, kind: 'place', place };
}

/**
 * The most famous first, then the smaller id: for the cities alone, the biggest first, as the cities file has them;
 * of places of as many sitelinks, the smaller Q-id.
 */
export function mostFamousFirst(one: PointOfInterest, two: PointOfInterest): number {
	return one.fame === two.fame ? one.id - two.id : two.fame - one.fame;
}
