// The graph's nodes and edges from the road segments the builder cut the ways into (pieces.ts): every chain of
// degree-2 nodes collapsed into one edge.
import { type GraphParts, MAX_EDGE_SECONDS } from 'engine/graph';
import type { BorderControls } from './border-controls.ts';
import { Column } from './column.ts';
import type { SegmentNodes, Segments } from './segments.ts';

/**
 * The graph of the road segments with every chain of degree-2 nodes collapsed into one edge. A node stays when
 * its degree is not 2, when a neighbour lies in another zone (so an edge across a border is the one segment that
 * crosses it), when the two roads through it differ in direction, and where a chain would outgrow an edge. An edge
 * across a border is marked when it passes one of `borderControls`. The segments here are the pieces of `Pieces`,
 * which kept every node this needs to see.
 */
export function collapse(nodes: SegmentNodes, segments: Segments, borderControls: BorderControls): Omit<GraphParts, 'zones' | 'zoneRings'> {
	return new Collapse(nodes, segments, borderControls).graph();
}

class Collapse {
	readonly #nodes: SegmentNodes;
	readonly #segments: Segments;
	/** The segments' ends. */
	readonly #segmentA: Uint32Array;
	readonly #segmentB: Uint32Array;
	readonly #borderControls: BorderControls;
	/** The segments at each node: those of node n are `#incident` from `#incidentStart[n]` to `#incidentStart[n + 1]`. */
	readonly #incidentStart: Uint32Array;
	readonly #incident: Uint32Array;
	/** 1 for a node that stays in the graph. */
	readonly #kept: Uint8Array;
	/** 1 for a segment walked. */
	readonly #visited: Uint8Array;
	/** Each node's index in the graph, or −1 while it has none. */
	readonly #graphIndex: Int32Array;
	readonly #graphNodes = new Column((length) => new Uint32Array(length));
	readonly #edgeFrom = new Column((length) => new Uint32Array(length));
	readonly #edgeTo = new Column((length) => new Uint32Array(length));
	readonly #edgeSeconds = new Column((length) => new Uint16Array(length));
	readonly #edgeBorderControl = new Column((length) => new Uint8Array(length));

	constructor(nodes: SegmentNodes, segments: Segments, borderControls: BorderControls) {
		this.#nodes = nodes;
		this.#segments = segments;
		this.#segmentA = segments.a;
		this.#segmentB = segments.b;
		this.#borderControls = borderControls;
		const { start, incident } = incidence(nodes.count, segments);
		this.#incidentStart = start;
		this.#incident = incident;
		this.#kept = new Uint8Array(nodes.count);
		this.#visited = new Uint8Array(segments.count);
		this.#graphIndex = new Int32Array(nodes.count).fill(-1);
	}

	graph(): Omit<GraphParts, 'zones' | 'zoneRings'> {
		this.#markKept();
		for (let node = 0; node < this.#nodes.count; node++) {
			if (this.#kept[node] === 1) {
				this.#walkFrom(node);
			}
		}
		// What is left unvisited are rings of degree-2 nodes joined to no other road: no one reaches them.
		const { lat, lon, zone } = this.#nodes;
		const graphNodes = this.#graphNodes.toArray();
		return {
			nodeLat: Int32Array.from(graphNodes, (node) => lat[node]),
			nodeLon: Int32Array.from(graphNodes, (node) => lon[node]),
			nodeZone: Uint8Array.from(graphNodes, (node) => zone[node]),
			edges: {
				from: this.#edgeFrom.toArray(),
				to: this.#edgeTo.toArray(),
				seconds: this.#edgeSeconds.toArray(),
				borderControl: this.#edgeBorderControl.toArray(),
			},
		};
	}

	/** Marks the nodes that stay whatever the chains through them: all but the plain links of a chain. */
	#markKept(): void {
		const start = this.#incidentStart;
		const zone = this.#nodes.zone;
		for (let node = 0; node < this.#nodes.count; node++) {
			if (start[node + 1] - start[node] !== 2) {
				this.#kept[node] = 1;
				continue;
			}
			const before = this.#incident[start[node]];
			const after = this.#incident[start[node] + 1];
			const previous = this.#other(before, node);
			const next = this.#other(after, node);
			const sameDirections =
				this.#seconds(before, previous) >= 0 === this.#seconds(after, node) >= 0 &&
				this.#seconds(before, node) >= 0 === this.#seconds(after, next) >= 0;
			const sameZone = zone[previous] === zone[node] && zone[next] === zone[node];
			if (previous === next || !sameDirections || !sameZone) {
				this.#kept[node] = 1;
			}
		}
	}

	/** Walks the chains from a kept node along its segments not walked yet. */
	#walkFrom(node: number): void {
		for (let slot = this.#incidentStart[node]; slot < this.#incidentStart[node + 1]; slot++) {
			if (this.#visited[this.#incident[slot]] === 0) {
				this.#walk(node, this.#incident[slot]);
			}
		}
	}

	/** Walks the chain from kept node `start` along segment `first` to the next kept node, adding its edges. */
	#walk(start: number, first: number): void {
		let chainStart = start;
		let node = start;
		let segment = first;
		let forward = 0;
		let backward = 0;
		for (;;) {
			this.#visited[segment] = 1;
			const next = this.#other(segment, node);
			const stepForward = this.#seconds(segment, node);
			const stepBackward = this.#seconds(segment, next);
			if (
				node !== chainStart &&
				(next === chainStart || forward + stepForward > MAX_EDGE_SECONDS || backward + stepBackward > MAX_EDGE_SECONDS)
			) {
				this.#kept[node] = 1;
				this.#emit(chainStart, node, forward, backward);
				chainStart = node;
				forward = 0;
				backward = 0;
			}
			forward = plus(forward, stepForward);
			backward = plus(backward, stepBackward);
			if (this.#kept[next] === 1) {
				this.#emit(chainStart, next, forward, backward);
				return;
			}
			segment = this.#onward(next, segment);
			node = next;
		}
	}

	/** Adds the edges between two kept nodes, in the directions with a time (−1 for none). */
	// oxlint-disable-next-line eslint/max-params -- once per edge of the world's graph: plain numbers, no object to allocate per edge
	#emit(from: number, to: number, forward: number, backward: number): void {
		if (from === to) {
			return;
		}
		const { lat, lon, zone } = this.#nodes;
		const borderControl = zone[from] !== zone[to] && this.#borderControls.near(lat[from], lon[from], lat[to], lon[to]) ? 1 : 0;
		if (forward >= 0) {
			this.#pushEdge(from, to, forward, borderControl);
		}
		if (backward >= 0) {
			this.#pushEdge(to, from, backward, borderControl);
		}
	}

	// oxlint-disable-next-line eslint/max-params -- once per edge of the world's graph: plain numbers, no object to allocate per edge
	#pushEdge(source: number, target: number, time: number, borderControl: number): void {
		this.#edgeFrom.push(this.#indexOf(source));
		this.#edgeTo.push(this.#indexOf(target));
		this.#edgeSeconds.push(Math.min(MAX_EDGE_SECONDS, Math.round(time)));
		this.#edgeBorderControl.push(borderControl);
	}

	/** The node's index in the graph, giving it the next one when it has none. */
	#indexOf(node: number): number {
		if (this.#graphIndex[node] < 0) {
			this.#graphIndex[node] = this.#graphNodes.length;
			this.#graphNodes.push(node);
		}
		return this.#graphIndex[node];
	}

	/** The segment's end that is not `node`. */
	#other(segment: number, node: number): number {
		return this.#segmentA[segment] === node ? this.#segmentB[segment] : this.#segmentA[segment];
	}

	/** The other segment of `node`, a node of two segments, than `segment`. */
	#onward(node: number, segment: number): number {
		const one = this.#incident[this.#incidentStart[node]];
		return one === segment ? this.#incident[this.#incidentStart[node] + 1] : one;
	}

	#seconds(segment: number, from: number): number {
		return this.#segments.seconds(segment, from);
	}
}

/** The segments at each node: those of node n are `incident` from `start[n]` to `start[n + 1]`. */
function incidence(nodeCount: number, segments: Segments): { start: Uint32Array; incident: Uint32Array } {
	const { a, b, count } = segments;
	const start = new Uint32Array(nodeCount + 1);
	for (let segment = 0; segment < count; segment++) {
		start[a[segment] + 1]++;
		start[b[segment] + 1]++;
	}
	for (let node = 0; node < nodeCount; node++) {
		start[node + 1] += start[node];
	}
	const incident = new Uint32Array(start[nodeCount]);
	const fill = start.slice(0, nodeCount);
	for (let segment = 0; segment < count; segment++) {
		incident[fill[a[segment]]++] = segment;
		incident[fill[b[segment]]++] = segment;
	}
	return { start, incident };
}

/** A chain's time so far in one direction plus a segment's, or −1 when either is not allowed in it. */
function plus(total: number, step: number): number {
	return total < 0 || step < 0 ? -1 : total + step;
}
