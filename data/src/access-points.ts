// The access points of places (GLOSSARY «Подъезд»; amendment «Набор данных» of spec #20): points of the graph's roads
// where a car gets to a place. A place with a point (a peak, a waterfall, a cave) gets the nearest point of a road in
// each country within a reach (MAX_ACCESS_METERS of places.ts).
import type { Graph } from 'engine/graph';
import type { Point } from './cities-file.ts';
import type { AccessPoint } from './places-file.ts';
import { type NearRoad, RoadIndex } from './road-index.ts';

/**
 * The access points of places with a point: a function of a place's point (degrees), one of `places`, giving the
 * nearest point of a road in each zone within `reach` metres, the nearest first. Only a road with both ends in one
 * zone counts, as for the origin (engine/src/snap.ts), so a point is in its road's zone.
 */
export function pointAccess(graph: Graph, places: readonly Point[], reach: number): (place: Point) => AccessPoint[] {
	const index = new RoadIndex(graph, reach, places);
	const { nodeLat, nodeLon, nodeZone, zones } = graph;
	return ({ lat, lon }) => {
		const nearest = new Map<number, NearRoad>();
		index.each(lat, lon, (road) => {
			const zone = nodeZone[road.a];
			const current = nearest.get(zone);
			if (zone !== 0 && zone === nodeZone[road.b] && (current === undefined || road.meters < current.meters)) {
				nearest.set(zone, road);
			}
		});
		return [...nearest]
			.toSorted(([zoneOne, one], [zoneTwo, two]) => (one.meters === two.meters ? zoneOne - zoneTwo : one.meters - two.meters))
			.map(([zone, { a, b, fraction }]) => ({
				lat: degrees(nodeLat[a] + fraction * (nodeLat[b] - nodeLat[a])),
				lon: degrees(nodeLon[a] + fraction * (nodeLon[b] - nodeLon[a])),
				zone: zones[zone],
			}));
	};
}

/** 1e-7 degrees to degrees to 0.001°, about 100 m: the ring holds the land 1 km around its roads. */
function degrees(e7: number): number {
	return Math.round(e7 / 10_000) / 1000;
}
