import { readFileSync } from 'node:fs';
import { decodeGraph, type Graph } from 'engine/graph';
import { type BuildReport, buildGraph } from '../build-graph.ts';
import { openOsm } from '../osm/open.ts';
import { log, seconds } from './input.ts';

/** The graph in a graph file (`.graph`), or built from an OSM extract. */
export function loadGraph(path: string): { graph: Graph; report?: BuildReport } {
	const started = performance.now();
	if (path.endsWith('.graph')) {
		const graph = decodeGraph(readFileSync(path));
		log(`read ${path} in ${seconds(started)}: ${graph.nodeLat.length} nodes, ${graph.edgeTarget.length} edges`);
		return { graph };
	}
	const { graph, report } = buildGraph(openOsm(path));
	log(
		`built the graph of ${path} in ${seconds(started)}: ${report.roadWays} road ways, ${report.nodes} nodes, ${report.edges} edges; ` +
			`zones ${report.zones.length > 0 ? report.zones.join(', ') : 'none'}` +
			(report.partialZones.length > 0 ? `; kept without the rings the extract holds only in part: ${report.partialZones.join(', ')}` : '') +
			(report.incompleteZones.length > 0
				? `; left out, as the extract holds no whole ring of them but holes: ${report.incompleteZones.join(', ')}`
				: ''),
	);
	const { pairsWithoutCrossings, crossingsNotFound } = report.borders;
	if (pairsWithoutCrossings.length > 0) {
		log(
			'pairs with passport control and no border crossing on their roads (add their crossings to the border table): ' +
				pairsWithoutCrossings.map(({ pair, edges }) => `${pair} (${edges} edges)`).join(', '),
		);
	}
	if (crossingsNotFound.length > 0) {
		log(`open crossings of the border table near no road across their border: ${crossingsNotFound.join(', ')}`);
	}
	return { graph, report };
}
