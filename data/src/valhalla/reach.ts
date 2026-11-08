// Our travel from a start point, for the comparison with Valhalla: everything the engine reaches within a limit,
// its contours, and its travel times to cities.
import type { LatLon, MultiPolygon } from 'engine';
import { passage } from 'engine/borders';
import { OFF_ROAD_SECONDS_PER_METER, ringContour } from 'engine/contour';
import { ZoneLocator } from 'engine/graph';
import { edgeSecondsBetween } from 'engine/snap';
import { startOnRoad } from 'engine/start';
import { TRAVEL_PER_DRIVING, traverse } from 'engine/traverse';
import { borderTable } from 'rules';
import type { OurRoads } from './ours.ts';

export interface OurReach {
	/** The contour of the places reached within `hours` of travel, by the engine's own contour. */
	readonly isochrone: (hours: number) => MultiPolygon;
	/**
	 * Travel time to each target in hours: to the target's nearest reached road, then off-road to it at 30 km/h, as the
	 * contour counts it. Infinity beyond the reach's limit, or with no road within the index's reach.
	 */
	readonly travelHours: (targets: readonly LatLon[]) => number[];
}

/**
 * Everything the engine reaches from the origin within `limitHours`: the origin's road reached as computeRing
 * reaches it (startOnRoad), then the engine's Dijkstra. Undefined when the origin has no road within 50 km.
 */
export function ourReach({ graph, index }: OurRoads, origin: LatLon, limitHours: number): OurReach | undefined {
	// oxlint-disable-next-line unicorn/no-useless-undefined -- startOnRoad requires the zone to snap in, and undefined is any zone
	const start = startOnRoad(graph, Math.round(origin.lat * 1e7), Math.round(origin.lon * 1e7), undefined);
	if (start === undefined) {
		return undefined;
	}
	// Every zone open, as computeRing has it with no country closed: the graph has only zone 0.
	const open = passage(graph, borderTable, [], 0);
	const { seconds } = traverse(graph, open, start.seeds, limitHours * 3600);
	const locator = new ZoneLocator(graph.zoneRings);
	return {
		isochrone: (hours) => {
			// Only what is reached within the hours, as a traversal up to them gives: the raster spans just that.
			const within = seconds.map((time) => (time <= hours * 3600 ? time : Infinity));
			return ringContour(graph, open, locator, { ...start, seconds: within }, -1, hours * 3600);
		},
		travelHours: (targets) =>
			targets.map((target) => {
				// The nearest reached road, as the contour carries the time of the nearest painted one.
				const road = index.nearest(target.lat, target.lon, (a, b) => seconds[a] < Infinity || seconds[b] < Infinity);
				if (road === undefined) {
					return Infinity;
				}
				const ab = edgeSecondsBetween(graph, road.a, road.b);
				const ba = edgeSecondsBetween(graph, road.b, road.a);
				const viaA = ab >= 0 ? seconds[road.a] + road.fraction * ab * TRAVEL_PER_DRIVING : Infinity;
				const viaB = ba >= 0 ? seconds[road.b] + (1 - road.fraction) * ba * TRAVEL_PER_DRIVING : Infinity;
				return (Math.min(viaA, viaB) + road.meters * OFF_ROAD_SECONDS_PER_METER) / 3600;
			}),
	};
}
