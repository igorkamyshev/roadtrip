// How the border table applies to a graph (spec #20 «Движок», «Обход»): which edges across a border a car may take,
// and the border delay on each. Worked out once per graph and table, which the engine reads on every calculation.
import type { BorderCrossing, BorderPair, BorderTable } from 'rules';
import { E7, segmentMeters } from './geo.ts';
import { BORDER_CROSSING_METERS, type Graph } from './graph.ts';

/** Where a traversal may go. */
export interface Passage {
	/** The zone each node counts as at a border: `borderZones` of the graph. */
	readonly zone: Uint8Array;
	/** 1 for each zone a car may enter, 0 for a closed country or territory. Zone 0, no zone, is open. */
	readonly open: Uint8Array;
	/** The border delay of each edge between two zones, in seconds of travel; Infinity where a car may not cross. */
	readonly borderSeconds: ReadonlyMap<number, number>;
}

/** An edge across a border, between two zones (neither of them zone 0), and what the border table makes of it. */
export interface BorderEdge {
	readonly edge: number;
	readonly from: number;
	readonly to: number;
	/** The pair's codes in alphabetical order, joined by «–». */
	readonly pair: string;
	/** The pair's row in the table, if it has one. */
	readonly row: BorderPair | undefined;
	/** The crossing of the table nearest to the edge, if one of the pair's is within BORDER_CROSSING_METERS. */
	readonly crossing: BorderCrossing | undefined;
	/** The border delay in seconds of travel; Infinity where a car may not cross. */
	readonly seconds: number;
}

const BLOCKING = new Set(['closed', 'no_crossing', 'pedestrian_only']);

const borderSecondsCache = new WeakMap<Graph, WeakMap<BorderTable, ReadonlyMap<number, number>>>();

/** The countries closed by the visa rules, alpha-3, and the start zone, which is open whatever they hold. */
interface VisaClosures {
	readonly closedCountries: readonly string[];
	readonly startZone: number;
}

/**
 * Where a traversal of `graph` may go under the border table, with `closedCountries` closed but for the start
 * zone, which is always open (spec #20 «Движок»).
 */
export function passage(graph: Graph, table: BorderTable, { closedCountries, startZone }: VisaClosures): Passage {
	let byTable = borderSecondsCache.get(graph);
	if (byTable === undefined) {
		byTable = new WeakMap();
		borderSecondsCache.set(graph, byTable);
	}
	let borderSeconds = byTable.get(table);
	if (borderSeconds === undefined) {
		borderSeconds = new Map(borderEdges(graph, table).map(({ edge, seconds }) => [edge, seconds]));
		byTable.set(table, borderSeconds);
	}
	const closedByVisas = new Set(closedCountries);
	const closed = closedForEveryone(graph, table);
	return {
		zone: borderZones(graph),
		open: Uint8Array.from(graph.zones, (code, zone) => (closed[zone] === 1 || (closedByVisas.has(code) && zone !== startZone) ? 0 : 1)),
		borderSeconds,
	};
}

const borderZonesCache = new WeakMap<Graph, Uint8Array>();

/**
 * The zone each node counts as at a border: its own, or for a node in no zone's polygon, the zone that most edges
 * into and out of its stretch of roads in no zone lead to, ties to the zone listed first. Such land lies between
 * countries where OSM has no polygon, as the West Bank between Israel and Jordan (69 of its 70 roads out lead to
 * Israel in 2026-11), so a road through it into another country crosses the border where it leaves it, and a road
 * into it from that country crosses it there. A stretch that leads to no zone (Antarctica) stays in zone 0.
 */
export function borderZones(graph: Graph): Uint8Array {
	let zones = borderZonesCache.get(graph);
	if (zones === undefined) {
		zones = zonesOfNoZone(graph);
		borderZonesCache.set(graph, zones);
	}
	return zones;
}

function zonesOfNoZone(graph: Graph): Uint8Array {
	const { nodeZone } = graph;
	// The nodes in no zone, numbered.
	const index = new Map<number, number>();
	for (let node = 0; node < nodeZone.length; node++) {
		if (nodeZone[node] === 0) {
			index.set(node, index.size);
		}
	}
	if (index.size === 0) {
		return nodeZone;
	}
	const root = joinStretches(graph, index);
	const stretchOf = (node: number): number => {
		const at = index.get(node);
		if (at === undefined) {
			throw new Error(`Node ${node} is in a zone, not in a stretch of no zone`);
		}
		return root(at);
	};
	const counts = edgesToZones(graph, stretchOf);
	const zones = nodeZone.slice();
	for (const [node, at] of index) {
		const byZone = counts.get(root(at));
		zones[node] = byZone === undefined ? 0 : mostLedTo(byZone);
	}
	return zones;
}

/**
 * The stretches of no zone by union–find over the edges between nodes in no zone: the root of the stretch of each
 * such node, by its number in `index`.
 */
function joinStretches(graph: Graph, index: ReadonlyMap<number, number>): (at: number) => number {
	const { firstEdge, edgeTarget } = graph;
	const parent = Int32Array.from({ length: index.size }, (_, at) => at);
	const root = (at: number): number => {
		while (parent[at] !== at) {
			parent[at] = parent[parent[at]];
			at = parent[at];
		}
		return at;
	};
	for (const [node, at] of index) {
		for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
			const other = index.get(edgeTarget[edge]);
			if (other !== undefined) {
				parent[root(at)] = root(other);
			}
		}
	}
	return root;
}

/** The edges between each stretch of no zone and each zone, either way: a count per zone, by the stretch. */
function edgesToZones(graph: Graph, stretchOf: (node: number) => number): Map<number, Uint32Array> {
	const { nodeZone, firstEdge, edgeTarget } = graph;
	const counts = new Map<number, Uint32Array>();
	const count = (stretch: number, zone: number) => {
		let byZone = counts.get(stretch);
		if (byZone === undefined) {
			byZone = new Uint32Array(graph.zones.length);
			counts.set(stretch, byZone);
		}
		byZone[zone]++;
	};
	for (let node = 0; node < nodeZone.length; node++) {
		for (let edge = firstEdge[node]; edge < firstEdge[node + 1]; edge++) {
			const target = edgeTarget[edge];
			if (nodeZone[node] === 0 && nodeZone[target] !== 0) {
				count(stretchOf(node), nodeZone[target]);
			} else if (nodeZone[node] !== 0 && nodeZone[target] === 0) {
				count(stretchOf(target), nodeZone[node]);
			}
		}
	}
	return counts;
}

/** The zone with the most edges, ties to the zone listed first. */
function mostLedTo(byZone: Uint32Array): number {
	let best = 0;
	for (let zone = 1; zone < byZone.length; zone++) {
		if (byZone[zone] > byZone[best]) {
			best = zone;
		}
	}
	return best;
}

/** 1 for each zone of the graph that is closed for everyone: a country of the table's, or a closed territory. */
export function closedForEveryone(graph: Graph, table: BorderTable): Uint8Array {
	const closed = new Set([...table.closedForEveryone, ...table.closedTerritories.map((territory) => territory.code)]);
	return Uint8Array.from(graph.zones, (code) => (closed.has(code) ? 1 : 0));
}

/**
 * Every edge across a border, by the rules of the spec's «Обход», in this order:
 * - a closed or pedestrian-only crossing of the table at the edge closes it;
 * - a `closed`, `no_crossing` or `pedestrian_only` pair is closed;
 * - a `crossings_only` pair is crossed at its open crossings, with the border delay;
 * - inside Schengen or at a `no_control` pair, any road crosses, in 0 h or the pair's own time;
 * - any other border has passport control: it is crossed at a border crossing (a `barrier=border_control` of
 *   OSM, or an open crossing of the table), with the border delay, the default or the pair's own.
 *
 * The zones are the nodes' `borderZones`. An edge to or from a stretch of no zone that leads to no zone is no border:
 * Antarctica, or a country whose polygon the extract does not hold.
 */
export function borderEdges(graph: Graph, table: BorderTable): BorderEdge[] {
	const { firstEdge, edgeTarget } = graph;
	const nodeZone = borderZones(graph);
	const borderEdge = borderEdgeRules(graph, table);
	const result: BorderEdge[] = [];
	for (let from = 0; from < nodeZone.length; from++) {
		for (let edge = firstEdge[from]; edge < firstEdge[from + 1]; edge++) {
			const to = edgeTarget[edge];
			if (nodeZone[to] !== nodeZone[from] && nodeZone[to] !== 0 && nodeZone[from] !== 0) {
				result.push(borderEdge({ edge, from, to }));
			}
		}
	}
	return result;
}

/** An edge of the graph, from node `from` to node `to`. */
interface EdgeEnds {
	readonly edge: number;
	readonly from: number;
	readonly to: number;
}

/** What the border table makes of an edge between two zones of the graph, neither of them zone 0. */
function borderEdgeRules(graph: Graph, table: BorderTable): (ends: EdgeEnds) => BorderEdge {
	const { zones } = graph;
	const nodeZone = borderZones(graph);
	const borderControl = new Set(graph.borderControlEdges);
	const schengen = new Set(table.schengen);
	const pairs = new Map(table.pairs.map((row) => [pairKey(...row.pair), row]));
	const crossings = Map.groupBy(table.crossings, (crossing) => pairKey(...crossing.pair));
	return (ends) => {
		const one = zones[nodeZone[ends.from]];
		const two = zones[nodeZone[ends.to]];
		const pair = pairKey(one, two);
		const row = pairs.get(pair);
		const crossing = nearestCrossing(graph, ends, crossings.get(pair));
		const seconds = borderDelaySeconds(row, crossing, {
			withoutControl: (schengen.has(one) && schengen.has(two)) || row?.status === 'no_control',
			atBorderControl: borderControl.has(ends.edge),
			defaultBorderHours: table.defaultBorderHours,
		});
		return { ...ends, pair, row, crossing, seconds };
	};
}

/** Where an edge across a border runs, beyond the pair's row and the crossing near it. */
interface BorderPlace {
	/** Inside Schengen, or at a `no_control` pair. */
	readonly withoutControl: boolean;
	/** The edge passes a `barrier=border_control` of OSM (`Graph.borderControlEdges`). */
	readonly atBorderControl: boolean;
	readonly defaultBorderHours: number;
}

/** The border delay of an edge across a border, in seconds of travel, by the rules of `borderEdges`. */
function borderDelaySeconds(row: BorderPair | undefined, crossing: BorderCrossing | undefined, place: BorderPlace): number {
	if (closes(row, crossing)) {
		return Infinity;
	}
	if (row?.status === 'crossings_only') {
		return crossing === undefined ? Infinity : controlSeconds(row, place);
	}
	if (place.withoutControl) {
		return (row?.borderHours ?? 0) * 3600;
	}
	return place.atBorderControl || crossing !== undefined ? controlSeconds(row, place) : Infinity;
}

/** A closed or pedestrian-only crossing of the table at the edge, or a `closed`, `no_crossing` or `pedestrian_only` pair. */
function closes(row: BorderPair | undefined, crossing: BorderCrossing | undefined): boolean {
	return (crossing !== undefined && crossing.status !== 'open') || (row !== undefined && BLOCKING.has(row.status));
}

/** The delay of passport control: the pair's own, or the table's default. */
function controlSeconds(row: BorderPair | undefined, place: BorderPlace): number {
	return (row?.borderHours ?? place.defaultBorderHours) * 3600;
}

/** The crossing nearest to the edge, if one is within BORDER_CROSSING_METERS of it. */
function nearestCrossing(
	graph: Graph,
	{ from, to }: EdgeEnds,
	crossings: readonly BorderCrossing[] | undefined,
): BorderCrossing | undefined {
	let nearest: BorderCrossing | undefined;
	let nearestMeters = BORDER_CROSSING_METERS;
	for (const crossing of crossings ?? []) {
		const meters = segmentMeters(
			Math.round(crossing.lat * E7),
			Math.round(crossing.lon * E7),
			graph.nodeLat[from],
			graph.nodeLon[from],
			graph.nodeLat[to],
			graph.nodeLon[to],
		);
		if (meters <= nearestMeters) {
			nearest = crossing;
			nearestMeters = meters;
		}
	}
	return nearest;
}

/** The key of an unordered pair of zone codes. */
function pairKey(one: string, two: string): string {
	return one < two ? `${one}–${two}` : `${two}–${one}`;
}
