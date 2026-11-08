// The builder: an OSM extract in, the road graph out (spec «Набор данных»). The extract is filtered or not:
// roads are picked here by their tags, and the coordinates come from the ways when the file carries them
// (`osmium add-locations-to-ways`) or else from its nodes.
//
// Sized for the world (~25 M road ways, ~330 M road nodes before collapsing; #35): with the locations on the ways,
// no node is kept by its id but the ones at a junction. The ways are read twice. The first time (scan.ts), every
// road's node ids go into `RepeatedIds`, which finds the ones at a junction. The second time, each road way is cut
// into pieces at those, at its ends and wherever a node of the graph must stay, and only the pieces' end nodes are
// kept (pieces.ts); `collapse` then joins the pieces across ways into the graph's edges (collapse.ts).
import { createGraph, type Graph, ZoneLocator } from 'engine/graph';
import { borderTable as shippedBorderTable, type BorderTable, borderTableProblems } from 'rules';
import { type BorderReport, borderReport } from './border-report.ts';
import { collapse } from './collapse.ts';
import type { OsmSource } from './osm/source.ts';
import { Pieces } from './pieces.ts';
import { roadOf } from './roads.ts';
import { scan } from './scan.ts';
import { ZoneCells } from './zone-cells.ts';
import { type FoundZones, findZones, graphZones, readZoneRelations, zoneRings } from './zones.ts';

export interface BuildReport {
	readonly roadWays: number;
	readonly nodes: number;
	readonly edges: number;
	/** The zones of the graph, by code. */
	readonly zones: readonly string[];
	/** The zones that are parts of countries (closed territories, Northern Cyprus), which win over their country. */
	readonly parts: readonly string[];
	/** Zones of which the extract holds no whole ring but holes: they are left out, their roads get no zone. */
	readonly incompleteZones: readonly string[];
	/**
	 * Zones of which the extract holds some rings whole and not others, which are left out: the world's USA, whose
	 * boundary around two remote atolls is in no part of Geofabrik's, or a neighbour at the edge of an extract.
	 */
	readonly partialZones: readonly string[];
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
	const scanned = scan(source, new Set(zoneRelations.flatMap((relation) => relation.ways.map((way) => way.id))));
	const found = findZones(zoneRelations, scanned.boundaryWays, scanned.locate);
	scanned.boundaryWays.clear();
	const parts = new Set(zoneRelations.filter((relation) => relation.part).map((relation) => relation.code));
	const codes = [...found.ringsByZone.keys()].toSorted();
	const zones = graphZones(codes, parts);
	const rings = zoneRings(found.ringsByZone, zones);

	const pieces = new Pieces(scanned.roadNodeIds.repeated(), new ZoneCells(new ZoneLocator(rings), rings));
	source.read({
		way(way) {
			const road = roadOf(way.tags);
			if (road !== undefined) {
				pieces.add(way, road, scanned.locate);
			}
		},
	});
	scanned.unlocated.clear();
	const graph = createGraph({ ...collapse(pieces, pieces.release(), scanned.borderControls), zones, zoneRings: rings });
	return {
		graph,
		report: {
			roadWays: scanned.roadWays,
			nodes: graph.nodeLat.length,
			edges: graph.edgeTarget.length,
			zones: zones.slice(1),
			parts: codes.filter((code) => parts.has(code)),
			...zonesLeftOut(found),
			borders: borderReport(graph, borderTable),
		},
	};
}

/** The zones the extract holds no whole ring of but holes, and those it holds some rings of only. */
function zonesLeftOut({ ringsByZone, incompleteZones, partialZones }: FoundZones): Pick<BuildReport, 'incompleteZones' | 'partialZones'> {
	return {
		incompleteZones: [...incompleteZones].filter((code) => !ringsByZone.has(code)).toSorted(),
		partialZones: [...partialZones, ...[...incompleteZones].filter((code) => ringsByZone.has(code))].toSorted(),
	};
}
