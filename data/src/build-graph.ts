// The builder: an OSM extract in, the road graph out (spec «Набор данных»). The extract is filtered or not:
// roads are picked here by their tags, and the coordinates come from the ways when the file carries them
// (`osmium add-locations-to-ways`) or else from its nodes.
import { createGraph, type Graph, MAX_EDGE_SECONDS, MAX_ZONES, ZoneLocator } from 'engine/graph';
import { haversineMeters } from 'engine/geo';
import { BorderControls, isBorderControl } from './border-controls.ts';
import { borderTable as shippedBorderTable, type BorderTable, borderTableProblems } from 'rules';
import { type BorderReport, borderReport } from './border-report.ts';
import type { OsmSource, OsmWay } from './osm/source.ts';
import { Column, NodeIds } from './node-ids.ts';
import { type Road, roadOf } from './roads.ts';
import { type BoundaryWay, joinRings, zoneOf, zoneRings } from './zones.ts';

export interface BuildReport {
	readonly roadWays: number;
	readonly nodes: number;
	readonly edges: number;
	/** The zones of the graph, by code. */
	readonly zones: readonly string[];
	/** The zones that are parts of countries (closed territories, Northern Cyprus), which win over their country. */
	readonly parts: readonly string[];
	/** Zones whose boundary the extract holds only in part: they are left out, their roads get no zone. */
	readonly incompleteZones: readonly string[];
	/** What the border table lacks for this graph. */
	readonly borders: BorderReport;
}

/**
 * The graph of an OSM extract, and the report of its build. The border table is checked first, and only feeds the
 * report: the graph does not depend on it.
 */
export function buildGraph(source: OsmSource, borderTable: BorderTable = shippedBorderTable): { graph: Graph; report: BuildReport } {
	const problems = borderTableProblems(borderTable);
	if (problems.length > 0) {
		throw new Error(`The border table has problems:\n${problems.join('\n')}`);
	}
	const zoneRelations = readZoneRelations(source);
	const boundaryWayIds = new Set(zoneRelations.flatMap((relation) => relation.wayIds));
	const roads = new RoadWays();
	const roadNodes = new OsmNodes();
	const boundaryWays = new Map<number, OsmWay>();
	const boundaryNodes = new OsmNodes();
	source.read({
		way(way) {
			const road = roadOf(way.tags);
			if (road !== undefined) {
				roads.add(way, road, roadNodes);
			}
			if (boundaryWayIds.has(way.id)) {
				boundaryWays.set(way.id, way);
				if (way.locations === undefined) {
					for (const ref of way.refs) {
						boundaryNodes.add(ref);
					}
				}
			}
		},
	});
	const borderControls = new BorderControls();
	source.read({
		node(node) {
			roadNodes.locate(roadNodes.ids.get(node.id), node.lat, node.lon);
			boundaryNodes.locate(boundaryNodes.ids.get(node.id), node.lat, node.lon);
			if (isBorderControl(node.tags)) {
				borderControls.add(node.lat, node.lon);
			}
		},
	});
	const coordinates = (way: OsmWay, index: number): [number, number] | undefined => {
		if (way.locations === undefined) {
			return boundaryNodes.coordinates(boundaryNodes.ids.get(way.refs[index]));
		}
		return Number.isNaN(way.locations.lat[index]) ? undefined : [way.locations.lat[index], way.locations.lon[index]];
	};

	// Zones: the relations whose whole boundary the extract holds.
	const ringsByZone = new Map<string, NonNullable<ReturnType<typeof joinRings>>>();
	const incompleteZones = new Set<string>();
	for (const relation of zoneRelations) {
		const ways: BoundaryWay[] = [];
		for (const id of relation.wayIds) {
			const way = boundaryWays.get(id);
			const points = way?.refs.map((_, index) => coordinates(way, index));
			if (way === undefined || points === undefined || points.some((point) => point === undefined)) {
				break;
			}
			ways.push({ refs: way.refs, lat: points.map((point) => point![0]), lon: points.map((point) => point![1]) });
		}
		const rings = ways.length === relation.wayIds.length ? joinRings(ways) : undefined;
		if (rings === undefined) {
			incompleteZones.add(relation.code);
		} else {
			ringsByZone.set(relation.code, [...(ringsByZone.get(relation.code) ?? []), ...rings]);
		}
	}
	// Parts of countries first, so they win over the country around them.
	const parts = new Set(zoneRelations.filter((relation) => relation.part).map((relation) => relation.code));
	const codes = [...ringsByZone.keys()].sort();
	const zones = ['', ...codes.filter((code) => parts.has(code)), ...codes.filter((code) => !parts.has(code))];
	if (zones.length > MAX_ZONES + 1) {
		throw new RangeError(`${zones.length - 1} zones, more than a node's zone byte holds`);
	}
	const rings = zoneRings(ringsByZone, zones);

	const nodes = new RoadNodes(roadNodes, new ZoneLocator(rings));
	const graph = collapse(nodes, roads.segments(nodes), zones, rings, borderControls);
	return {
		graph,
		report: {
			roadWays: roads.count,
			nodes: graph.nodeLat.length,
			edges: graph.edgeTarget.length,
			zones: zones.slice(1),
			parts: codes.filter((code) => parts.has(code)),
			incompleteZones: [...incompleteZones].filter((code) => !ringsByZone.has(code)).sort(),
			borders: borderReport(graph, borderTable),
		},
	};
}

function readZoneRelations(source: OsmSource): { code: string; part: boolean; wayIds: number[] }[] {
	const relations: { code: string; part: boolean; wayIds: number[] }[] = [];
	source.read({
		relation(relation) {
			const zone = zoneOf(relation);
			if (zone !== undefined) {
				relations.push({ ...zone, wayIds: relation.members.filter((member) => member.type === 'way').map((member) => member.ref) });
			}
		},
	});
	return relations;
}

/** OSM nodes by id, numbered as first met, with their coordinates once known. */
class OsmNodes {
	readonly ids = new NodeIds();
	readonly lat = new Column((length) => new Int32Array(length));
	readonly lon = new Column((length) => new Int32Array(length));
	readonly located = new Column((length) => new Uint8Array(length));

	get count(): number {
		return this.lat.length;
	}

	add(id: number): number {
		const number = this.ids.add(id);
		if (number === this.lat.length) {
			this.lat.push(0);
			this.lon.push(0);
			this.located.push(0);
		}
		return number;
	}

	/** Gives node `number` its coordinates, unless it has them already; a number below 0 is no node. */
	locate(number: number, lat: number, lon: number): void {
		if (number >= 0 && this.located.values[number] === 0) {
			this.lat.values[number] = lat;
			this.lon.values[number] = lon;
			this.located.values[number] = 1;
		}
	}

	coordinates(number: number): [number, number] | undefined {
		return number >= 0 && this.located.values[number] === 1 ? [this.lat.values[number], this.lon.values[number]] : undefined;
	}
}

const FORWARD = 1;
const BACKWARD = 2;

/** The road ways of an extract: each one's speed and directions, and its nodes by their OsmNodes number. */
class RoadWays {
	readonly #firstNode = new Column((length) => new Uint32Array(length));
	readonly #kmh = new Column((length) => new Float64Array(length));
	readonly #directions = new Column((length) => new Uint8Array(length));
	readonly #nodes = new Column((length) => new Uint32Array(length));

	get count(): number {
		return this.#kmh.length;
	}

	add(way: OsmWay, road: Road, nodes: OsmNodes): void {
		this.#firstNode.push(this.#nodes.length);
		this.#kmh.push(road.kmh);
		this.#directions.push((road.forward ? FORWARD : 0) | (road.backward ? BACKWARD : 0));
		for (let index = 0; index < way.refs.length; index++) {
			const number = nodes.add(way.refs[index]);
			this.#nodes.push(number);
			if (way.locations !== undefined && !Number.isNaN(way.locations.lat[index])) {
				nodes.locate(number, way.locations.lat[index], way.locations.lon[index]);
			}
		}
	}

	/** The segments between consecutive nodes of each way that have coordinates, with their driving times. */
	segments(nodes: RoadNodes): Segments {
		const segments = new Segments(this.#nodes.length);
		const firstNode = this.#firstNode.values;
		const wayNodes = this.#nodes.values;
		for (let way = 0; way < this.count; way++) {
			const metersPerSecond = this.#kmh.values[way] / 3.6;
			const directions = this.#directions.values[way];
			const end = way + 1 < this.count ? firstNode[way + 1] : this.#nodes.length;
			let previous = -1;
			for (let index = firstNode[way]; index < end; index++) {
				const node = nodes.of(wayNodes[index]);
				if (node >= 0 && previous >= 0 && node !== previous) {
					segments.add(previous, node, nodes.meters(previous, node) / metersPerSecond, directions);
				}
				previous = node;
			}
		}
		return segments;
	}
}

/** The nodes of the roads that have coordinates, numbered in the order of their OsmNodes numbers, with their zones. */
class RoadNodes {
	readonly count: number;
	readonly lat: Int32Array;
	readonly lon: Int32Array;
	readonly zone: Uint8Array;
	/** The road node of each OsmNodes number, −1 for a node without coordinates; undefined when all have them. */
	readonly #of: Int32Array | undefined;

	constructor(nodes: OsmNodes, locator: ZoneLocator) {
		const located = nodes.located.values.subarray(0, nodes.count);
		if (located.includes(0)) {
			this.#of = new Int32Array(nodes.count).fill(-1);
			let count = 0;
			for (let number = 0; number < nodes.count; number++) {
				if (located[number] === 1) {
					this.#of[number] = count++;
				}
			}
			this.count = count;
			this.lat = new Int32Array(count);
			this.lon = new Int32Array(count);
			for (let number = 0; number < nodes.count; number++) {
				if (this.#of[number] >= 0) {
					this.lat[this.#of[number]] = nodes.lat.values[number];
					this.lon[this.#of[number]] = nodes.lon.values[number];
				}
			}
		} else {
			this.count = nodes.count;
			this.lat = nodes.lat.values.subarray(0, nodes.count);
			this.lon = nodes.lon.values.subarray(0, nodes.count);
		}
		this.zone = new Uint8Array(this.count);
		for (let node = 0; node < this.count; node++) {
			this.zone[node] = locator.zoneAt(this.lat[node], this.lon[node]);
		}
	}

	/** The road node of an OsmNodes number, or −1 when it has no coordinates. */
	of(number: number): number {
		return this.#of === undefined ? number : this.#of[number];
	}

	meters(a: number, b: number): number {
		return haversineMeters(this.lat[a] / 1e7, this.lon[a] / 1e7, this.lat[b] / 1e7, this.lon[b] / 1e7);
	}
}

/** Road segments between two consecutive nodes of a way, with their driving time and the directions allowed. */
class Segments {
	readonly a: Uint32Array;
	readonly b: Uint32Array;
	readonly #seconds: Float64Array;
	readonly #directions: Uint8Array;
	count = 0;

	constructor(capacity: number) {
		this.a = new Uint32Array(capacity);
		this.b = new Uint32Array(capacity);
		this.#seconds = new Float64Array(capacity);
		this.#directions = new Uint8Array(capacity);
	}

	add(a: number, b: number, seconds: number, directions: number): void {
		this.a[this.count] = a;
		this.b[this.count] = b;
		this.#seconds[this.count] = seconds;
		this.#directions[this.count] = directions;
		this.count++;
	}

	/** The driving time of a segment leaving `from`, one of its ends, or −1 when that direction is not allowed. */
	seconds(segment: number, from: number): number {
		const direction = this.a[segment] === from ? FORWARD : BACKWARD;
		return this.#directions[segment] & direction ? this.#seconds[segment] : -1;
	}
}

/**
 * The graph of the road segments with every chain of degree-2 nodes collapsed into one edge. A node stays when
 * its degree is not 2, when a neighbour lies in another zone (so an edge across a border is the one segment that
 * crosses it), when the two roads through it differ in direction, and where a chain would outgrow an edge. An edge
 * across a border is marked when it passes one of `borderControls`.
 */
function collapse(
	nodes: RoadNodes,
	segments: Segments,
	zones: readonly string[],
	zoneRings: Graph['zoneRings'],
	borderControls: BorderControls,
): Graph {
	const nodeCount = nodes.count;
	const segmentCount = segments.count;
	const incidentStart = new Uint32Array(nodeCount + 1);
	for (let segment = 0; segment < segmentCount; segment++) {
		incidentStart[segments.a[segment] + 1]++;
		incidentStart[segments.b[segment] + 1]++;
	}
	for (let node = 0; node < nodeCount; node++) {
		incidentStart[node + 1] += incidentStart[node];
	}
	const incident = new Uint32Array(incidentStart[nodeCount]);
	const fill = incidentStart.slice(0, nodeCount);
	for (let segment = 0; segment < segmentCount; segment++) {
		incident[fill[segments.a[segment]]++] = segment;
		incident[fill[segments.b[segment]]++] = segment;
	}
	const other = (segment: number, node: number) => (segments.a[segment] === node ? segments.b[segment] : segments.a[segment]);
	const seconds = (segment: number, from: number) => segments.seconds(segment, from);

	const kept = new Uint8Array(nodeCount);
	for (let node = 0; node < nodeCount; node++) {
		if (incidentStart[node + 1] - incidentStart[node] !== 2) {
			kept[node] = 1;
			continue;
		}
		const before = incident[incidentStart[node]];
		const after = incident[incidentStart[node] + 1];
		const previous = other(before, node);
		const next = other(after, node);
		const sameDirections =
			seconds(before, previous) >= 0 === seconds(after, node) >= 0 && seconds(before, node) >= 0 === seconds(after, next) >= 0;
		const sameZone = nodes.zone[previous] === nodes.zone[node] && nodes.zone[next] === nodes.zone[node];
		if (previous === next || !sameDirections || !sameZone) {
			kept[node] = 1;
		}
	}

	const graphIndex = new Int32Array(nodeCount).fill(-1);
	const graphNodes = new Column((length) => new Uint32Array(length));
	const indexOf = (node: number) => {
		if (graphIndex[node] < 0) {
			graphIndex[node] = graphNodes.length;
			graphNodes.push(node);
		}
		return graphIndex[node];
	};
	const edgeFrom = new Column((length) => new Uint32Array(length));
	const edgeTo = new Column((length) => new Uint32Array(length));
	const edgeSeconds = new Column((length) => new Uint16Array(length));
	const edgeBorderControl = new Column((length) => new Uint8Array(length));
	const pushEdge = (source: number, target: number, time: number, borderControl: number) => {
		edgeFrom.push(indexOf(source));
		edgeTo.push(indexOf(target));
		edgeSeconds.push(Math.min(MAX_EDGE_SECONDS, Math.round(time)));
		edgeBorderControl.push(borderControl);
	};
	const emit = (from: number, to: number, forward: number, backward: number) => {
		if (from === to) {
			return;
		}
		const borderControl =
			nodes.zone[from] !== nodes.zone[to] && borderControls.near(nodes.lat[from], nodes.lon[from], nodes.lat[to], nodes.lon[to]) ? 1 : 0;
		if (forward >= 0) {
			pushEdge(from, to, forward, borderControl);
		}
		if (backward >= 0) {
			pushEdge(to, from, backward, borderControl);
		}
	};

	const visited = new Uint8Array(segmentCount);
	const walk = (start: number, first: number) => {
		let chainStart = start;
		let node = start;
		let segment = first;
		let forward = 0;
		let backward = 0;
		for (;;) {
			visited[segment] = 1;
			const next = other(segment, node);
			const stepForward = seconds(segment, node);
			const stepBackward = seconds(segment, next);
			if (node !== chainStart && (next === chainStart || forward + stepForward > MAX_EDGE_SECONDS || backward + stepBackward > MAX_EDGE_SECONDS)) {
				kept[node] = 1;
				emit(chainStart, node, forward, backward);
				chainStart = node;
				forward = 0;
				backward = 0;
			}
			forward = forward < 0 || stepForward < 0 ? -1 : forward + stepForward;
			backward = backward < 0 || stepBackward < 0 ? -1 : backward + stepBackward;
			if (kept[next]) {
				emit(chainStart, next, forward, backward);
				return;
			}
			const [one, two] = [incident[incidentStart[next]], incident[incidentStart[next] + 1]];
			segment = one === segment ? two : one;
			node = next;
		}
	};
	for (let node = 0; node < nodeCount; node++) {
		if (!kept[node]) {
			continue;
		}
		for (let slot = incidentStart[node]; slot < incidentStart[node + 1]; slot++) {
			if (!visited[incident[slot]]) {
				walk(node, incident[slot]);
			}
		}
	}
	// What is left unvisited are rings of degree-2 nodes joined to no other road: no one reaches them.

	return createGraph({
		nodeLat: Int32Array.from(graphNodes.toArray(), (node) => nodes.lat[node]),
		nodeLon: Int32Array.from(graphNodes.toArray(), (node) => nodes.lon[node]),
		nodeZone: Uint8Array.from(graphNodes.toArray(), (node) => nodes.zone[node]),
		edges: {
			from: edgeFrom.toArray(),
			to: edgeTo.toArray(),
			seconds: edgeSeconds.toArray(),
			borderControl: edgeBorderControl.toArray(),
		},
		zones,
		zoneRings,
	});
}
