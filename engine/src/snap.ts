import { LocalProjection } from './geo.ts';
import type { Graph } from './graph.ts';

/** A road further from the origin than this is no road for it: `no_roads`. */
export const MAX_SNAP_METERS = 50_000;

/** Where the origin meets the road: on the segment from node `a` to node `b`, `fraction` of the way from `a`. */
export interface Snap {
	readonly a: number;
	readonly b: number;
	readonly fraction: number;
	readonly meters: number;
}

/**
 * The nearest point of a road to the origin (1e-7 degrees), on a road with both ends in `zone`, or on any road
 * when `zone` is undefined. Undefined when there is none within MAX_SNAP_METERS.
 */
export function snapToRoad(graph: Graph, lat: number, lon: number, zone: number | undefined): Snap | undefined {
	const { nodeLat, nodeLon, nodeZone, firstEdge, edgeTarget } = graph;
	const projection = new LocalProjection(lat, lon);
	const latReach = MAX_SNAP_METERS / projection.metersPerE7Lat;
	const lonReach = MAX_SNAP_METERS / projection.metersPerE7Lon;
	let best: Snap | undefined;
	let bestMeters = MAX_SNAP_METERS;
	for (let a = 0; a < nodeLat.length; a++) {
		if (zone !== undefined && nodeZone[a] !== zone) {
			continue;
		}
		const latA = nodeLat[a];
		const lonA = nodeLon[a];
		for (let edge = firstEdge[a]; edge < firstEdge[a + 1]; edge++) {
			const b = edgeTarget[edge];
			if (zone !== undefined && nodeZone[b] !== zone) {
				continue;
			}
			const latB = nodeLat[b];
			const lonB = nodeLon[b];
			if (
				Math.min(latA, latB) > lat + latReach ||
				Math.max(latA, latB) < lat - latReach ||
				Math.min(lonA, lonB) > lon + lonReach ||
				Math.max(lonA, lonB) < lon - lonReach
			) {
				continue;
			}
			const ax = projection.x(lonA);
			const ay = projection.y(latA);
			const dx = projection.x(lonB) - ax;
			const dy = projection.y(latB) - ay;
			const lengthSquared = dx * dx + dy * dy;
			const fraction = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
			const meters = Math.hypot(ax + fraction * dx, ay + fraction * dy);
			if (meters < bestMeters || (meters === bestMeters && best === undefined)) {
				bestMeters = meters;
				best = { a, b, fraction, meters };
			}
		}
	}
	return best;
}

/** The shortest driving time of an edge from `from` to `to`, in seconds, or −1 when there is no such edge. */
export function edgeSecondsBetween(graph: Graph, from: number, to: number): number {
	let seconds = -1;
	for (let edge = graph.firstEdge[from]; edge < graph.firstEdge[from + 1]; edge++) {
		if (graph.edgeTarget[edge] === to && (seconds < 0 || graph.edgeSeconds[edge] < seconds)) {
			seconds = graph.edgeSeconds[edge];
		}
	}
	return seconds;
}
