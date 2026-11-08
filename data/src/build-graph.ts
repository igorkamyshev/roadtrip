// The builder: an OSM extract in, the road graph out (spec «Набор данных»). The extract is filtered or not:
// roads are picked here by their tags, and the coordinates come from the ways when the file carries them
// (`osmium add-locations-to-ways`) or else from its nodes.
//
// Sized for the world (~25 M road ways, ~330 M road nodes before collapsing; #35): with the locations on the ways,
// no node is kept by its id but the ones at a junction. The ways are read twice. The first time, every road's
// node ids go into `RepeatedIds`, which finds the ones at a junction. The second time, each road way is cut into
// pieces at those, at its ends and wherever a node of the graph must stay, and only the pieces' end nodes are
// kept; `collapse` then joins the pieces across ways into the graph's edges.
import { createGraph, type Graph, MAX_EDGE_SECONDS, MAX_ZONES, ZoneLocator } from 'engine/graph';
import { haversineMeters } from 'engine/geo';
import { BorderControls, isBorderControl } from './border-controls.ts';
import { borderTable as shippedBorderTable, type BorderTable, borderTableProblems } from 'rules';
import { type BorderReport, borderReport } from './border-report.ts';
import type { OsmSource, OsmWay } from './osm/source.ts';
import { Column, NodeIds, RepeatedIds } from './node-ids.ts';
import { type Road, roadOf } from './roads.ts';
import { ZoneCells } from './zone-cells.ts';
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
	const roadNodeIds = new RepeatedIds();
	let roadWays = 0;
	const boundaryWays = new Map<number, OsmWay>();
	// The nodes of the roads and boundaries whose ways the file gives no locations, located by the file's nodes.
	const unlocated = new OsmNodes();
	source.read({
		way(way) {
			const road = roadOf(way.tags) !== undefined;
			const boundary = boundaryWayIds.has(way.id);
			if (road) {
				roadWays++;
				for (const ref of way.refs) {
					roadNodeIds.add(ref);
				}
			}
			if (boundary) {
				boundaryWays.set(way.id, way);
			}
			if ((road || boundary) && way.locations === undefined) {
				for (const ref of way.refs) {
					unlocated.add(ref);
				}
			}
		},
	});
	const borderControls = new BorderControls();
	source.read({
		node(node) {
			unlocated.locate(unlocated.ids.get(node.id), node.lat, node.lon);
			if (isBorderControl(node.tags)) {
				borderControls.add(node.lat, node.lon);
			}
		},
	});
	/** Writes the coordinates of the way's node `index` to `point`; false when the file lacks the node. */
	const locate = (way: OsmWay, index: number, point: Int32Array): boolean => {
		if (way.locations === undefined) {
			return unlocated.coordinates(unlocated.ids.get(way.refs[index]), point);
		}
		const lat = way.locations.lat[index];
		if (Number.isNaN(lat)) {
			return false;
		}
		point[0] = lat;
		point[1] = way.locations.lon[index];
		return true;
	};

	// Zones: the relations whose whole boundary the extract holds.
	const ringsByZone = new Map<string, NonNullable<ReturnType<typeof joinRings>>>();
	const incompleteZones = new Set<string>();
	const point = new Int32Array(2);
	for (const relation of zoneRelations) {
		const ways: BoundaryWay[] = [];
		for (const id of relation.wayIds) {
			const way = boundaryWays.get(id);
			if (way === undefined) {
				break;
			}
			const lat: number[] = [];
			const lon: number[] = [];
			for (let index = 0; index < way.refs.length && locate(way, index, point); index++) {
				lat.push(point[0]);
				lon.push(point[1]);
			}
			if (lat.length < way.refs.length) {
				break;
			}
			ways.push({ refs: way.refs, lat, lon });
		}
		const rings = ways.length === relation.wayIds.length ? joinRings(ways) : undefined;
		if (rings === undefined) {
			incompleteZones.add(relation.code);
		} else {
			ringsByZone.set(relation.code, [...(ringsByZone.get(relation.code) ?? []), ...rings]);
		}
	}
	boundaryWays.clear();
	// Parts of countries first, so they win over the country around them.
	const parts = new Set(zoneRelations.filter((relation) => relation.part).map((relation) => relation.code));
	const codes = [...ringsByZone.keys()].sort();
	const zones = ['', ...codes.filter((code) => parts.has(code)), ...codes.filter((code) => !parts.has(code))];
	if (zones.length > MAX_ZONES + 1) {
		throw new RangeError(`${zones.length - 1} zones, more than a node's zone byte holds`);
	}
	const rings = zoneRings(ringsByZone, zones);

	const pieces = new Pieces(roadNodeIds.repeated(), new ZoneCells(new ZoneLocator(rings), rings));
	source.read({
		way(way) {
			const road = roadOf(way.tags);
			if (road !== undefined) {
				pieces.add(way, road, locate);
			}
		},
	});
	unlocated.clear();
	const graph = collapse(pieces, pieces.release(), zones, rings, borderControls);
	return {
		graph,
		report: {
			roadWays,
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
	ids = new NodeIds();
	lat = new Column((length) => new Int32Array(length));
	lon = new Column((length) => new Int32Array(length));
	located = new Column((length) => new Uint8Array(length));

	add(id: number): void {
		if (this.ids.add(id) === this.lat.length) {
			this.lat.push(0);
			this.lon.push(0);
			this.located.push(0);
		}
	}

	/** Gives node `number` its coordinates, unless it has them already; a number below 0 is no node. */
	locate(number: number, lat: number, lon: number): void {
		if (number >= 0 && this.located.values[number] === 0) {
			this.lat.values[number] = lat;
			this.lon.values[number] = lon;
			this.located.values[number] = 1;
		}
	}

	/** Writes node `number`'s coordinates to `point`; false when it has none. */
	coordinates(number: number, point: Int32Array): boolean {
		if (number < 0 || this.located.values[number] === 0) {
			return false;
		}
		point[0] = this.lat.values[number];
		point[1] = this.lon.values[number];
		return true;
	}

	clear(): void {
		this.ids = new NodeIds();
		this.lat = new Column((length) => new Int32Array(length));
		this.lon = new Column((length) => new Int32Array(length));
		this.located = new Column((length) => new Uint8Array(length));
	}
}

const FORWARD = 1;
const BACKWARD = 2;

/**
 * The road ways cut into pieces, each piece a chain of segments between two nodes that may stay in the graph: the
 * ways' ends, the nodes at a junction, a node next to one the file lacks, a node with a neighbour in another zone
 * or whose two neighbours are one node. A piece holds no more driving time than an edge, and one that comes back
 * to its start is cut at its second and second-to-last nodes, as `collapse` would cut such a chain. Only the
 * pieces' end nodes are kept, numbered as first met, as `collapse` takes them.
 */
class Pieces {
	readonly #ids = new NodeIds();
	readonly #lat = new Column((length) => new Int32Array(length));
	readonly #lon = new Column((length) => new Int32Array(length));
	readonly #zone = new Column((length) => new Uint8Array(length));
	readonly #segments = new Segments();
	readonly #junctions: NodeIds;
	readonly #zones: ZoneCells;
	// The way being cut: its nodes with coordinates, without a node repeated right after itself.
	#wayIds = new Float64Array(64);
	#wayLat = new Int32Array(64);
	#wayLon = new Int32Array(64);
	#wayZone = new Uint8Array(64);
	#cut = new Uint8Array(64);
	readonly #point = new Int32Array(2);

	/** `junctions`: the ids of the nodes that more than one place of the road ways refers to. */
	constructor(junctions: NodeIds, zones: ZoneCells) {
		this.#junctions = junctions;
		this.#zones = zones;
	}

	get count(): number {
		return this.#lat.length;
	}

	get lat(): Int32Array {
		return this.#lat.values;
	}

	get lon(): Int32Array {
		return this.#lon.values;
	}

	get zone(): Uint8Array {
		return this.#zone.values;
	}

	add(way: OsmWay, road: Road, locate: (way: OsmWay, index: number, point: Int32Array) => boolean): void {
		const directions = (road.forward ? FORWARD : 0) | (road.backward ? BACKWARD : 0);
		const metersPerSecond = road.kmh / 3.6;
		let length = 0;
		for (let index = 0; index < way.refs.length; index++) {
			if (!locate(way, index, this.#point)) {
				this.#cutRun(length, metersPerSecond, directions);
				length = 0;
				continue;
			}
			const id = way.refs[index];
			if (length > 0 && this.#wayIds[length - 1] === id) {
				continue;
			}
			if (length === this.#wayIds.length) {
				this.#grow();
			}
			this.#wayIds[length] = id;
			this.#wayLat[length] = this.#point[0];
			this.#wayLon[length] = this.#point[1];
			this.#wayZone[length] = this.#zones.zoneAt(this.#point[0], this.#point[1]);
			length++;
		}
		this.#cutRun(length, metersPerSecond, directions);
	}

	/** The segments of the pieces, once every road way is added: the ids of the nodes are let go. */
	release(): Segments {
		this.#junctions.clear();
		this.#ids.clear();
		return this.#segments;
	}

	/** Cuts the first `length` nodes of the way, a run of nodes with coordinates, into pieces. */
	#cutRun(length: number, metersPerSecond: number, directions: number): void {
		if (length < 2) {
			return;
		}
		const ids = this.#wayIds;
		const zone = this.#wayZone;
		const cut = this.#cut;
		cut[0] = 1;
		cut[length - 1] = 1;
		for (let node = 1; node < length - 1; node++) {
			const stays =
				zone[node - 1] !== zone[node] || zone[node + 1] !== zone[node] || ids[node - 1] === ids[node + 1] || this.#junctions.get(ids[node]) >= 0;
			cut[node] = stays ? 1 : 0;
		}
		// A piece that comes back to its start.
		for (let start = 0, end = 1; end < length; end++) {
			if (cut[end]) {
				if (ids[end] === ids[start] && end - start >= 3) {
					cut[start + 1] = 1;
					cut[end - 1] = 1;
				}
				start = end;
			}
		}
		let start = 0;
		let seconds = 0;
		for (let node = 0; node < length - 1; node++) {
			const step = this.#meters(node, node + 1) / metersPerSecond;
			if (node !== start && seconds + step > MAX_EDGE_SECONDS) {
				this.#segments.add(this.#node(start), this.#node(node), seconds, directions);
				start = node;
				seconds = 0;
			}
			seconds += step;
			if (cut[node + 1]) {
				this.#segments.add(this.#node(start), this.#node(node + 1), seconds, directions);
				start = node + 1;
				seconds = 0;
			}
		}
	}

	/** The kept node of the way's node `index`. */
	#node(index: number): number {
		const number = this.#ids.add(this.#wayIds[index]);
		if (number === this.#lat.length) {
			this.#lat.push(this.#wayLat[index]);
			this.#lon.push(this.#wayLon[index]);
			this.#zone.push(this.#wayZone[index]);
		}
		return number;
	}

	#meters(a: number, b: number): number {
		return haversineMeters(this.#wayLat[a] / 1e7, this.#wayLon[a] / 1e7, this.#wayLat[b] / 1e7, this.#wayLon[b] / 1e7);
	}

	#grow(): void {
		const grown = <Array extends Float64Array | Int32Array | Uint8Array>(array: Array, make: (length: number) => Array) => {
			const bigger = make(array.length * 2);
			bigger.set(array as never);
			return bigger;
		};
		this.#wayIds = grown(this.#wayIds, (length) => new Float64Array(length));
		this.#wayLat = grown(this.#wayLat, (length) => new Int32Array(length));
		this.#wayLon = grown(this.#wayLon, (length) => new Int32Array(length));
		this.#wayZone = grown(this.#wayZone, (length) => new Uint8Array(length));
		this.#cut = new Uint8Array(this.#cut.length * 2);
	}
}

/** Road segments between two nodes, with their driving time and the directions allowed. */
class Segments {
	readonly #a = new Column((length) => new Uint32Array(length));
	readonly #b = new Column((length) => new Uint32Array(length));
	readonly #seconds = new Column((length) => new Float64Array(length));
	readonly #directions = new Column((length) => new Uint8Array(length));

	get count(): number {
		return this.#a.length;
	}

	get a(): Uint32Array {
		return this.#a.values;
	}

	get b(): Uint32Array {
		return this.#b.values;
	}

	add(a: number, b: number, seconds: number, directions: number): void {
		this.#a.push(a);
		this.#b.push(b);
		this.#seconds.push(seconds);
		this.#directions.push(directions);
	}

	/** The driving time of a segment leaving `from`, one of its ends, or −1 when that direction is not allowed. */
	seconds(segment: number, from: number): number {
		const direction = this.#a.values[segment] === from ? FORWARD : BACKWARD;
		return this.#directions.values[segment] & direction ? this.#seconds.values[segment] : -1;
	}
}

/**
 * The graph of the road segments with every chain of degree-2 nodes collapsed into one edge. A node stays when
 * its degree is not 2, when a neighbour lies in another zone (so an edge across a border is the one segment that
 * crosses it), when the two roads through it differ in direction, and where a chain would outgrow an edge. An edge
 * across a border is marked when it passes one of `borderControls`. The segments here are the pieces of `Pieces`,
 * which kept every node this needs to see.
 */
function collapse(
	nodes: { readonly count: number; readonly lat: Int32Array; readonly lon: Int32Array; readonly zone: Uint8Array },
	segments: Segments,
	zones: readonly string[],
	zoneRings: Graph['zoneRings'],
	borderControls: BorderControls,
): Graph {
	const nodeCount = nodes.count;
	const segmentCount = segments.count;
	const { a: segmentA, b: segmentB } = segments;
	const incidentStart = new Uint32Array(nodeCount + 1);
	for (let segment = 0; segment < segmentCount; segment++) {
		incidentStart[segmentA[segment] + 1]++;
		incidentStart[segmentB[segment] + 1]++;
	}
	for (let node = 0; node < nodeCount; node++) {
		incidentStart[node + 1] += incidentStart[node];
	}
	const incident = new Uint32Array(incidentStart[nodeCount]);
	const fill = incidentStart.slice(0, nodeCount);
	for (let segment = 0; segment < segmentCount; segment++) {
		incident[fill[segmentA[segment]]++] = segment;
		incident[fill[segmentB[segment]]++] = segment;
	}
	const other = (segment: number, node: number) => (segmentA[segment] === node ? segmentB[segment] : segmentA[segment]);
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
