// Where a traversal starts (spec «Движок», «Привязка»): the origin snapped to a road, the drive to it at 30 km/h, and
// the ends of the road it drives to. computeRing and the comparison with Valhalla (data/src/valhalla/ours.ts) both
// start here.
import { OFF_ROAD_SECONDS_PER_METER } from './contour.ts';
import type { Graph } from './graph.ts';
import { edgeSecondsBetween, type OriginRoad, snapToRoad } from './snap.ts';
import { type Seed, TRAVEL_PER_DRIVING } from './traverse.ts';

export interface Start extends OriginRoad {
	/** The ends of the origin's road that it drives to, each with its travel time from the origin. */
	readonly seeds: readonly Seed[];
}

/**
 * The origin (1e-7 degrees) on its road, as `snapToRoad` picks it in `zone`, or in any zone when undefined. The origin
 * reaches the road in a straight line at 30 km/h of driving, then drives it to each end it may be driven to.
 * Undefined when there is no road within 50 km.
 */
export function startOnRoad(graph: Graph, lat: number, lon: number, zone: number | undefined): Start | undefined {
	const snap = snapToRoad(graph, lat, lon, zone);
	if (snap === undefined) {
		return undefined;
	}
	const accessSeconds = snap.meters * OFF_ROAD_SECONDS_PER_METER;
	// Travel time along the origin's road, end to end, each way it may be driven.
	const forwardSeconds = travelSecondsBetween(graph, snap.a, snap.b);
	const backSeconds = travelSecondsBetween(graph, snap.b, snap.a);
	const seeds: Seed[] = [];
	if (forwardSeconds !== undefined) {
		seeds.push({ node: snap.b, seconds: accessSeconds + (1 - snap.fraction) * forwardSeconds });
	}
	if (backSeconds !== undefined) {
		seeds.push({ node: snap.a, seconds: accessSeconds + snap.fraction * backSeconds });
	}
	return { snap, accessSeconds, forwardSeconds, backSeconds, seeds };
}

function travelSecondsBetween(graph: Graph, from: number, to: number): number | undefined {
	const seconds = edgeSecondsBetween(graph, from, to);
	return seconds < 0 ? undefined : seconds * TRAVEL_PER_DRIVING;
}
