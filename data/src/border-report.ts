// The build report on borders (spec #20 «Набор данных», «Отчёт сборки»): what to add to the border table by hand.
import { borderEdges, closedForEveryone } from 'engine/borders';
import type { Graph } from 'engine/graph';
import type { BorderTable } from 'rules';

export interface BorderReport {
	/**
	 * The pairs with passport control whose roads cross their border nowhere at a border crossing: OSM has no
	 * `barrier=border_control` near them and the table no open crossing. A car cannot cross these, so add the
	 * pair's crossings to the table. With the number of edges across the border.
	 */
	readonly pairsWithoutCrossings: readonly { readonly pair: string; readonly edges: number }[];
	/**
	 * The table's open crossings near no road across their pair's border, of the pairs whose border the graph has:
	 * wrong coordinates, or a crossing OSM has no car road at. A closed one there closes nothing, which is fine.
	 */
	readonly crossingsNotFound: readonly string[];
}

const BLOCKING = new Set(['closed', 'no_crossing', 'pedestrian_only']);

export function borderReport(graph: Graph, table: BorderTable): BorderReport {
	const closed = closedForEveryone(graph, table);
	const byPair = Map.groupBy(borderEdges(graph, table), (edge) => edge.pair);
	const pairsWithoutCrossings: { pair: string; edges: number }[] = [];
	for (const [pair, edges] of byPair) {
		const [{ row, from, to }] = edges;
		const shut = closed[graph.nodeZone[from]] === 1 || closed[graph.nodeZone[to]] === 1 || (row !== undefined && BLOCKING.has(row.status));
		if (!shut && edges.every((edge) => edge.seconds === Infinity)) {
			pairsWithoutCrossings.push({ pair, edges: edges.length });
		}
	}
	const found = new Set([...byPair.values()].flat().map((edge) => edge.crossing?.id));
	return {
		pairsWithoutCrossings: pairsWithoutCrossings.toSorted((one, two) => one.pair.localeCompare(two.pair)),
		crossingsNotFound: table.crossings
			.filter((crossing) => crossing.status === 'open' && byPair.has(crossing.pair.join('–')) && !found.has(crossing.id))
			.map((crossing) => crossing.id),
	};
}
