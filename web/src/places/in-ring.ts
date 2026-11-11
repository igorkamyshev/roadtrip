// Which places are in the ring (spec #154 «Отбор мест кольца», GLOSSARY «Подъезд»): a place is in it when any of its
// access points is (the test of src/points/ring-test.ts, the cities' too: inside the ring's MultiPolygon, in a zone
// `access` opens), wherever its own point is: a large place is in several rings, one at the border in the ring of an
// open country beside a closed one. On the screen it has one access point, the nearest the origin in a straight line of
// those in the ring: the map shows it there, «Маршрут» leads there, and its zone is the place's country.
import { distanceKm } from 'data/cities-file';
import type { AccessPoint, Place } from 'data/places-file';
import type { RingTest } from '../points/ring-test.ts';
import type { LatLon } from '../state/point.ts';

/** A place of the ring, at its access point on the screen. */
export interface PlaceInRing {
	readonly place: Place;
	readonly access: AccessPoint;
}

export function placesInRing(places: readonly Place[], ring: RingTest, origin: LatLon): PlaceInRing[] {
	const found: PlaceInRing[] = [];
	for (const place of places) {
		const access = nearestInRing(place, ring, origin);
		if (access !== undefined) {
			found.push({ place, access });
		}
	}
	return found;
}

/** The place's access point in the ring nearest the origin by great-circle distance; undefined when none is in it. */
function nearestInRing(place: Place, { inside, open }: RingTest, origin: LatLon): AccessPoint | undefined {
	let nearest: AccessPoint | undefined;
	let nearestDistance = Infinity;
	for (const access of place.access) {
		const distance = open(access.zone) && inside(access.lat, access.lon) ? distanceKm(origin, access) : Infinity;
		if (distance < nearestDistance) {
			nearest = access;
			nearestDistance = distance;
		}
	}
	return nearest;
}
