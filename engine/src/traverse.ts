import type { Passage } from './borders.ts';
import type { Graph } from './graph.ts';
import { NodeHeap } from './heap.ts';
import { edgeSecondsBetween } from './snap.ts';

/** Travel time is driving time × 1.2: the allowance for stops (spec «Решение»). */
export const TRAVEL_PER_DRIVING = 1.2;

export interface Seed {
	readonly node: number;
	/** Travel time to the node from the origin, in seconds. */
	readonly seconds: number;
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
export function edgeTravelSeconds(graph: Graph, passage: Passage, from: number, edge: number): number {
	const zone = passage.zone[graph.edgeTarget[edge]];
	if (!passage.open[zone]) {
		return Infinity;
	}
	const seconds = graph.edgeSeconds[edge] * TRAVEL_PER_DRIVING;
	return zone === passage.zone[from] ? seconds : seconds + (passage.borderSeconds.get(edge) ?? 0);
}

/** Dijkstra by travel time from the seeds, up to `limitSeconds` of travel, where the passage lets it go. */
export function traverse(graph: Graph, passage: Passage, seeds: readonly Seed[], limitSeconds: number): Traversal {
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
	for (let node = 0; node < seconds.length; node++) {
		if (seconds[node] > limitSeconds) {
			seconds[node] = Infinity;
		}
	}
	return { seconds, exhausted };
}

/**
 * The longest travel time to any point of the roads an exhausted traversal reached, in seconds. The latest
 * point of a two-way road is where the times from its two ends meet; of a one-way road, its far end.
 */
export function latestArrival(graph: Graph, traversal: Traversal): number {
	const { firstEdge, edgeTarget, edgeSeconds } = graph;
	const { seconds } = traversal;
	let latest = 0;
	for (let from = 0; from < seconds.length; from++) {
		const fromSeconds = seconds[from];
		if (fromSeconds === Infinity) {
			continue;
		}
		latest = Math.max(latest, fromSeconds);
		for (let edge = firstEdge[from]; edge < firstEdge[from + 1]; edge++) {
			const to = edgeTarget[edge];
			if (seconds[to] === Infinity) {
				// The traversal was exhausted, so the edge leads where a car may not go.
				continue;
			}
			const forward = edgeSeconds[edge] * TRAVEL_PER_DRIVING;
			const back = edgeSecondsBetween(graph, to, from) * TRAVEL_PER_DRIVING;
			if (back < 0) {
				latest = Math.max(latest, fromSeconds + forward);
			} else if (forward + back > 0) {
				// Where fromSeconds + s × forward = seconds[to] + (1 − s) × back.
				latest = Math.max(latest, fromSeconds + (forward * (seconds[to] + back - fromSeconds)) / (forward + back));
			}
		}
	}
	return latest;
}
