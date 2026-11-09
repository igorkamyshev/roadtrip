import type { Passage } from './borders.ts';
import type { Graph } from './graph.ts';
import { NodeHeap } from './heap.ts';
import { edgeSecondsBetween, type OriginRoad } from './snap.ts';

/** Travel time is driving time × 1.2: the allowance for stops (spec #20 «Решение»). */
export const TRAVEL_PER_DRIVING = 1.2;

export interface Seed {
	readonly node: number;
	/** Travel time to the node from the origin, in seconds. */
	readonly seconds: number;
}

/** Where a traversal starts, and how far it goes. */
export interface TraversalBounds {
	readonly seeds: readonly Seed[];
	/** The most travel time a traversal goes, in seconds. */
	readonly limitSeconds: number;
}

export interface Traversal {
	/** Travel time to each node in seconds, for every node reached within the limit; Infinity for the rest. */
	readonly seconds: Float64Array;
	/** Whether every node reachable at all was reached within the limit. */
	readonly exhausted: boolean;
}

/**
 * Travel time over `edge`, which leaves `from`, in seconds: its driving time × 1.2 and any border delay; Infinity
 * where the passage does not let a car go.
 */
// oxlint-disable-next-line eslint/max-params -- a hot path, per edge of the traversal and the contour: an object would be allocated per call (ADR 0002)
export function edgeTravelSeconds(graph: Graph, passage: Passage, from: number, edge: number): number {
	const zone = passage.zone[graph.edgeTarget[edge]];
	if (passage.open[zone] === 0) {
		return Infinity;
	}
	const seconds = graph.edgeSeconds[edge] * TRAVEL_PER_DRIVING;
	return zone === passage.zone[from] ? seconds : seconds + (passage.borderSeconds.get(edge) ?? 0);
}

/** Dijkstra by travel time from the seeds, up to `limitSeconds` of travel, where the passage lets it go. */
export function traverse(graph: Graph, passage: Passage, { seeds, limitSeconds }: TraversalBounds): Traversal {
	const { firstEdge, edgeTarget } = graph;
	const seconds = new Float64Array(graph.nodeLat.length).fill(Infinity);
	const heap = new NodeHeap();
	for (const seed of seeds) {
		if (seed.seconds < seconds[seed.node]) {
			seconds[seed.node] = seed.seconds;
			heap.push(seed.node, seed.seconds);
		}
	}
	while (heap.size > 0) {
		const node = heap.topNode;
		const key = heap.topKey;
		if (key > limitSeconds) {
			break;
		}
		heap.pop();
		if (key > seconds[node]) {
			continue;
		}
		for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
			const target = edgeTarget[edge];
			const arrival = key + edgeTravelSeconds(graph, passage, node, edge);
			if (arrival < seconds[target]) {
				seconds[target] = arrival;
				heap.push(target, arrival);
			}
		}
	}
	const exhausted = heap.size === 0;
	forgetBeyond(seconds, limitSeconds);
	return { seconds, exhausted };
}

/** Infinity for each node whose time is past the limit: an edge's far end gets its time before the limit stops the heap. */
function forgetBeyond(seconds: Float64Array, limitSeconds: number): void {
	for (let node = 0; node < seconds.length; node++) {
		if (seconds[node] > limitSeconds) {
			seconds[node] = Infinity;
		}
	}
}

/**
 * The longest travel time to any point of the roads an exhausted traversal from the origin reached, in seconds. The
 * latest point of a two-way road is where the times from its two ends meet; of a one-way road, its far end. The
 * origin's own road is two roads that meet where the origin meets it.
 */
export function latestArrival(graph: Graph, traversal: Traversal, origin: OriginRoad): number {
	const { firstEdge, edgeTarget, edgeSeconds } = graph;
	const { seconds } = traversal;
	const { snap, accessSeconds, forwardSeconds, backSeconds } = origin;
	let latest = accessSeconds;
	for (let from = 0; from < seconds.length; from++) {
		const fromSeconds = seconds[from];
		if (fromSeconds === Infinity) {
			continue;
		}
		latest = Math.max(latest, fromSeconds);
		for (let edge = firstEdge[from]; edge < firstEdge[from + 1]; edge++) {
			const to = edgeTarget[edge];
			if (seconds[to] === Infinity || (from === snap.a && to === snap.b) || (from === snap.b && to === snap.a)) {
				// The traversal was exhausted, so the edge leads where a car may not go; or it is the origin's road.
				continue;
			}
			const back = edgeSecondsBetween(graph, to, from);
			const forward = edgeSeconds[edge] * TRAVEL_PER_DRIVING;
			latest = Math.max(latest, latestOn(fromSeconds, seconds[to], forward, back < 0 ? undefined : back * TRAVEL_PER_DRIVING));
		}
	}
	const toOrigin = snap.fraction;
	const pastOrigin = 1 - snap.fraction;
	latest = Math.max(latest, latestOn(seconds[snap.a], accessSeconds, share(forwardSeconds, toOrigin), share(backSeconds, toOrigin)));
	return Math.max(latest, latestOn(accessSeconds, seconds[snap.b], share(forwardSeconds, pastOrigin), share(backSeconds, pastOrigin)));
}

/** The travel time over a share of a road, undefined where it may not be driven that way. */
function share(travel: number | undefined, fraction: number): number | undefined {
	return travel === undefined ? undefined : travel * fraction;
}

/**
 * The latest point of a road between two points reached at `one` and `other` seconds of travel (Infinity when not
 * reached): driven in `forward` seconds from the one to the other, and in `back` the other way; undefined where the
 * road is one-way the other way. −Infinity when no point of it is reached.
 */
// oxlint-disable-next-line eslint/max-params -- a hot path, per edge the traversal reached: an object would be allocated per call (ADR 0002)
function latestOn(one: number, other: number, forward: number | undefined, back: number | undefined): number {
	if (forward !== undefined && back !== undefined) {
		// Where one + s × forward = other + (1 − s) × back.
		return forward + back > 0 ? one + (forward * (other + back - one)) / (forward + back) : Math.max(one, other);
	}
	if (forward !== undefined) {
		return one === Infinity ? -Infinity : one + forward;
	}
	return back === undefined || other === Infinity ? -Infinity : other + back;
}
