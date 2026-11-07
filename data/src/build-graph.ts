// The builder: an OSM extract in, the road graph out (spec «Набор данных»). The extract is filtered or not:
// roads are picked here by their tags, and the coordinates come from the ways when the file carries them
// (`osmium add-locations-to-ways`) or else from its nodes.
import { createGraph, type Graph, MAX_EDGE_SECONDS, MAX_ZONES, ZoneLocator } from 'engine/graph';
import { haversineMeters } from 'engine/geo';
import { BorderControls, isBorderControl } from './border-controls.ts';
import type { OsmSource, OsmWay } from './osm/source.ts';
import { type Road, roadOf } from './roads.ts';
import { type BoundaryWay, joinRings, zoneOf, zoneRings } from './zones.ts';

export interface BuildReport {
	readonly roadWays: number;
	readonly nodes: number;
	readonly edges: number;
	/** The zones of the graph, by code. */
	readonly zones: readonly string[];
	/** Zones whose boundary the extract holds only in part: they are left out, their roads get no zone. */
	readonly incompleteZones: readonly string[];
}

export function buildGraph(source: OsmSource): { graph: Graph; report: BuildReport } {
	const zoneRelations = readZoneRelations(source);
	const boundaryWayIds = new Set(zoneRelations.flatMap((relation) => relation.wayIds));
	const roads: { way: OsmWay; road: Road }[] = [];
	const boundaryWays = new Map<number, OsmWay>();
	const missing = new Set<number>();
	source.read({
		way(way) {
			const road = roadOf(way.tags);
			if (road !== undefined) {
				roads.push({ way, road });
			}
			if (boundaryWayIds.has(way.id)) {
				boundaryWays.set(way.id, way);
			}
			if ((road !== undefined || boundaryWayIds.has(way.id)) && way.locations === undefined) {
				for (const ref of way.refs) {
					missing.add(ref);
				}
			}
		},
	});
	const nodeCoordinates = new Map<number, [number, number]>();
	const borderControls = new BorderControls();
	source.read({
		node(node) {
			if (missing.has(node.id)) {
				nodeCoordinates.set(node.id, [node.lat, node.lon]);
			}
			if (isBorderControl(node.tags)) {
				borderControls.add(node.lat, node.lon);
			}
		},
	});
	const coordinates = (way: OsmWay, index: number): [number, number] | undefined =>
		way.locations === undefined ? nodeCoordinates.get(way.refs[index]) : [way.locations.lat[index], way.locations.lon[index]];

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
	const locator = new ZoneLocator(rings);

	// Road nodes and the segments between them.
	const nodes = new RoadNodes(locator);
	const segments = new Segments();
	for (const { way, road } of roads) {
		const metersPerSecond = road.kmh / 3.6;
		let previous: number | undefined;
		for (let index = 0; index < way.refs.length; index++) {
			const point = coordinates(way, index);
			const node = point === undefined ? undefined : nodes.add(way.refs[index], point[0], point[1]);
			if (node !== undefined && previous !== undefined && node !== previous) {
				const seconds = nodes.meters(previous, node) / metersPerSecond;
				segments.add(previous, node, road.forward ? seconds : -1, road.backward ? seconds : -1);
			}
			previous = node;
		}
	}
	const graph = collapse(nodes, segments, zones, rings, borderControls);
	return {
		graph,
		report: {
			roadWays: roads.length,
			nodes: graph.nodeLat.length,
			edges: graph.edgeTarget.length,
			zones: zones.slice(1),
			incompleteZones: [...incompleteZones].filter((code) => !ringsByZone.has(code)).sort(),
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

/** The nodes of the roads, numbered as first met, with their coordinates and zones. */
class RoadNodes {
	readonly lat: number[] = [];
	readonly lon: number[] = [];
	readonly zone: number[] = [];
	readonly #index = new Map<number, number>();
	readonly #locator: ZoneLocator;

	constructor(locator: ZoneLocator) {
		this.#locator = locator;
	}

	get count(): number {
		return this.lat.length;
	}

	add(id: number, lat: number, lon: number): number {
		let index = this.#index.get(id);
		if (index === undefined) {
			index = this.lat.length;
			this.#index.set(id, index);
			this.lat.push(lat);
			this.lon.push(lon);
			this.zone.push(this.#locator.zoneAt(lat, lon));
		}
		return index;
	}

	meters(a: number, b: number): number {
		return haversineMeters(this.lat[a] / 1e7, this.lon[a] / 1e7, this.lat[b] / 1e7, this.lon[b] / 1e7);
	}
}

/** Road segments between two consecutive nodes of a way, with the driving time each way (−1: not allowed). */
class Segments {
	readonly a: number[] = [];
	readonly b: number[] = [];
	readonly forward: number[] = [];
	readonly backward: number[] = [];

	add(a: number, b: number, forward: number, backward: number): void {
		this.a.push(a);
		this.b.push(b);
		this.forward.push(forward);
		this.backward.push(backward);
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
	const segmentCount = segments.a.length;
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
	const seconds = (segment: number, from: number) => (segments.a[segment] === from ? segments.forward[segment] : segments.backward[segment]);

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
	const graphNodes: number[] = [];
	const indexOf = (node: number) => {
		if (graphIndex[node] < 0) {
			graphIndex[node] = graphNodes.push(node) - 1;
		}
		return graphIndex[node];
	};
	const edgeFrom: number[] = [];
	const edgeTo: number[] = [];
	const edgeSeconds: number[] = [];
	const edgeBorderControl: number[] = [];
	const emit = (from: number, to: number, forward: number, backward: number) => {
		if (from === to) {
			return;
		}
		const borderControl =
			nodes.zone[from] !== nodes.zone[to] && borderControls.near(nodes.lat[from], nodes.lon[from], nodes.lat[to], nodes.lon[to]) ? 1 : 0;
		for (const [source, target, time] of [
			[from, to, forward],
			[to, from, backward],
		]) {
			if (time >= 0) {
				edgeFrom.push(indexOf(source));
				edgeTo.push(indexOf(target));
				edgeSeconds.push(Math.min(MAX_EDGE_SECONDS, Math.round(time)));
				edgeBorderControl.push(borderControl);
			}
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
		nodeLat: Int32Array.from(graphNodes, (node) => nodes.lat[node]),
		nodeLon: Int32Array.from(graphNodes, (node) => nodes.lon[node]),
		nodeZone: Uint8Array.from(graphNodes, (node) => nodes.zone[node]),
		edges: {
			from: Uint32Array.from(edgeFrom),
			to: Uint32Array.from(edgeTo),
			seconds: Uint16Array.from(edgeSeconds),
			borderControl: Uint8Array.from(edgeBorderControl),
		},
		zones,
		zoneRings,
	});
}
