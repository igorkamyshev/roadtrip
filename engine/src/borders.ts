// How the border table applies to a graph (spec «Движок», «Обход»): which edges across a border a car may take,
// and the border delay on each. Worked out once per graph and table, which the engine reads on every calculation.
import type { BorderCrossing, BorderPair, BorderTable } from 'rules';
import { E7, segmentMeters } from './geo.ts';
import { BORDER_CROSSING_METERS, type Graph } from './graph.ts';

/** Where a traversal may go. */
export interface Passage {
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

/**
 * Where a traversal of `graph` may go under the border table, with `closedCountries` closed but for the start
 * zone, which is always open (spec «Движок»).
 */
export function passage(graph: Graph, table: BorderTable, closedCountries: readonly string[], startZone: number): Passage {
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
		open: Uint8Array.from(graph.zones, (code, zone) => (closed[zone] || (closedByVisas.has(code) && zone !== startZone) ? 0 : 1)),
		borderSeconds,
	};
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
 * An edge to or from no zone (zone 0) is no border: the sea, a gap between polygons, or a country whose polygon
 * the extract does not hold.
 */
export function borderEdges(graph: Graph, table: BorderTable): BorderEdge[] {
	const { nodeZone, firstEdge, edgeTarget, zones } = graph;
	const borderControl = new Set(graph.borderControlEdges);
	const schengen = new Set(table.schengen);
	const pairs = new Map(table.pairs.map((row) => [pairKey(...row.pair), row]));
	const crossings = Map.groupBy(table.crossings, (crossing) => pairKey(...crossing.pair));
	const result: BorderEdge[] = [];
	for (let from = 0; from < nodeZone.length; from++) {
		for (let edge = firstEdge[from]; edge < firstEdge[from + 1]; edge++) {
			const to = edgeTarget[edge];
			if (nodeZone[to] === nodeZone[from] || nodeZone[to] === 0 || nodeZone[from] === 0) {
				continue;
			}
			const [one, two] = [zones[nodeZone[from]], zones[nodeZone[to]]].sort();
			const pair = pairKey(one, two);
			const row = pairs.get(pair);
			const crossing = nearestCrossing(graph, from, to, crossings.get(pair));
			const controlSeconds = (row?.borderHours ?? table.defaultBorderHours) * 3600;
			let seconds: number;
			if ((crossing !== undefined && crossing.status !== 'open') || (row !== undefined && BLOCKING.has(row.status))) {
				seconds = Infinity;
			} else if (row?.status === 'crossings_only') {
				seconds = crossing === undefined ? Infinity : controlSeconds;
			} else if ((schengen.has(one) && schengen.has(two)) || row?.status === 'no_control') {
				seconds = (row?.borderHours ?? 0) * 3600;
			} else {
				seconds = borderControl.has(edge) || crossing !== undefined ? controlSeconds : Infinity;
			}
			result.push({ edge, from, to, pair, row, crossing, seconds });
		}
	}
	return result;
}

/** The crossing nearest to the edge from `a` to `b`, if one is within BORDER_CROSSING_METERS of it. */
function nearestCrossing(graph: Graph, a: number, b: number, crossings: readonly BorderCrossing[] | undefined): BorderCrossing | undefined {
	let nearest: BorderCrossing | undefined;
	let nearestMeters = BORDER_CROSSING_METERS;
	for (const crossing of crossings ?? []) {
		const meters = segmentMeters(
			Math.round(crossing.lat * E7),
			Math.round(crossing.lon * E7),
			graph.nodeLat[a],
			graph.nodeLon[a],
			graph.nodeLat[b],
			graph.nodeLon[b],
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
