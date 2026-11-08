import { LocalProjection } from './geo.ts';
import type { Graph } from './graph.ts';

/** A road further from the origin than this is no road for it: `no_roads`. */
export const MAX_SNAP_METERS = 50_000;

/** The origin in 1e-7 degrees, and the zone whose roads it snaps to: any zone's when undefined. */
export interface SnapOrigin {
	readonly lat: number;
	readonly lon: number;
	readonly zone: number | undefined;
}

/** Where the origin meets the road: on the segment from node `a` to node `b`, `fraction` of the way from `a`. */
export interface Snap {
	readonly a: number;
	readonly b: number;
	readonly fraction: number;
	readonly meters: number;
}

/** The origin on its road: where it meets it, and the travel times to there and along the road. */
export interface OriginRoad {
	readonly snap: Snap;
	/** Travel time from the origin to where it meets its road. */
	readonly accessSeconds: number;
	/** Travel time along the origin's road from `snap.a` to `snap.b`; undefined when it is one-way the other way. */
	readonly forwardSeconds: number | undefined;
	/** Travel time along the origin's road from `snap.b` to `snap.a`; undefined when it is one-way the other way. */
	readonly backSeconds: number | undefined;
}

/**
 * A road from which fewer nodes are reachable leads nowhere, as a one-way street whose only way on is a street the
 * graph does not hold: the origin is not snapped to it. Valhalla's `minimum_reachability`, 50 by default.
 */
export const MIN_REACHABLE_NODES = 50;

/**
 * The nearest point of a road to the origin, on a road with both ends in the origin's `zone`, or on any road with
 * both ends in one zone when it is undefined: never on the road across a border, which would start the origin in
 * two countries. Of those, the nearest road from which MIN_REACHABLE_NODES nodes are reachable, driving it each way
 * it may be driven; the nearest of all when none is. Undefined when there is none within MAX_SNAP_METERS.
 */
export function snapToRoad(graph: Graph, origin: SnapOrigin): Snap | undefined {
	let nearest: Snap | undefined;
	eachRoad(graph, origin, (snap) => {
		if (nearest === undefined || snap.meters < nearest.meters) {
			nearest = snap;
		}
	});
	if (nearest === undefined || reachesEnough(graph, nearest)) {
		return nearest;
	}
	// Rarely needed: every road within reach, nearest first, the order of the scan among equals.
	const roads: Snap[] = [];
	eachRoad(graph, origin, (snap) => {
		roads.push(snap);
	});
	roads.sort((one, other) => one.meters - other.meters);
	return roads.find((road) => reachesEnough(graph, road)) ?? nearest;
}

/** Calls `onRoad` with the nearest point of each road within MAX_SNAP_METERS that `snapToRoad` may snap to. */
function eachRoad(graph: Graph, origin: SnapOrigin, onRoad: (snap: Snap) => void): void {
	const { nodeLat, nodeZone, firstEdge, edgeTarget } = graph;
	const { zone } = origin;
	const { beyondReach, nearestPoint } = reachOf(graph, origin);
	for (let a = 0; a < nodeLat.length; a++) {
		if (zone !== undefined && nodeZone[a] !== zone) {
			continue;
		}
		for (let edge = firstEdge[a]; edge < firstEdge[a + 1]; edge++) {
			const b = edgeTarget[edge];
			if (nodeZone[b] !== nodeZone[a] || beyondReach(a, b)) {
				continue;
			}
			const snap = nearestPoint(a, b);
			if (snap !== undefined) {
				onRoad(snap);
			}
		}
	}
}

/** How the origin reaches the road from node `a` to node `b`. */
interface Reach {
	/** The road's box is further than MAX_SNAP_METERS from the origin: no need to project it. */
	readonly beyondReach: (a: number, b: number) => boolean;
	/** The road's nearest point to the origin; undefined when it is further than MAX_SNAP_METERS. */
	readonly nearestPoint: (a: number, b: number) => Snap | undefined;
}

/** A point of a road: how far along it from its node `a` to its node `b` (0 to 1), and how far from an origin. */
export interface RoadPoint {
	readonly fraction: number;
	readonly meters: number;
}

/**
 * The point of a road nearest the origin of `projection`: a function of the road's nodes `a` and `b`, which takes
 * them as plain numbers since it runs for every road near the origin.
 */
export function nearestOnRoad(graph: Graph, projection: LocalProjection): (a: number, b: number) => RoadPoint {
	const { nodeLat, nodeLon } = graph;
	return (a, b) => {
		const ax = projection.x(nodeLon[a]);
		const ay = projection.y(nodeLat[a]);
		const dx = projection.x(nodeLon[b]) - ax;
		const dy = projection.y(nodeLat[b]) - ay;
		const lengthSquared = dx * dx + dy * dy;
		const fraction = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));
		return { fraction, meters: Math.hypot(ax + fraction * dx, ay + fraction * dy) };
	};
}

function reachOf(graph: Graph, { lat, lon }: SnapOrigin): Reach {
	const { nodeLat, nodeLon } = graph;
	const projection = new LocalProjection(lat, lon);
	const pointOn = nearestOnRoad(graph, projection);
	const latReach = MAX_SNAP_METERS / projection.metersPerE7Lat;
	const lonReach = MAX_SNAP_METERS / projection.metersPerE7Lon;
	return {
		beyondReach: (a, b) =>
			Math.min(nodeLat[a], nodeLat[b]) > lat + latReach ||
			Math.max(nodeLat[a], nodeLat[b]) < lat - latReach ||
			Math.min(nodeLon[a], nodeLon[b]) > lon + lonReach ||
			Math.max(nodeLon[a], nodeLon[b]) < lon - lonReach,
		nearestPoint: (a, b) => {
			const { fraction, meters } = pointOn(a, b);
			return meters <= MAX_SNAP_METERS ? { a, b, fraction, meters } : undefined;
		},
	};
}

/** Whether MIN_REACHABLE_NODES nodes are reachable from the road of the snap, by the roads' directions alone. */
function reachesEnough(graph: Graph, snap: Snap): boolean {
	const { firstEdge, edgeTarget } = graph;
	const reached = new Set<number>();
	const queue: number[] = [];
	const reach = (node: number) => {
		if (!reached.has(node)) {
			reached.add(node);
			queue.push(node);
		}
	};
	if (edgeSecondsBetween(graph, snap.a, snap.b) >= 0) {
		reach(snap.b);
	}
	if (edgeSecondsBetween(graph, snap.b, snap.a) >= 0) {
		reach(snap.a);
	}
	for (let at = 0; at < queue.length && reached.size < MIN_REACHABLE_NODES; at++) {
		for (let edge = firstEdge[queue[at]]; edge < firstEdge[queue[at] + 1]; edge++) {
			reach(edgeTarget[edge]);
		}
	}
	return reached.size >= MIN_REACHABLE_NODES;
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
