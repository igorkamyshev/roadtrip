// The builder's passes over an extract before it cuts the roads (build-graph.ts): the ways, for the road nodes' ids,
// which find the ones at a junction, and for the ways of the zones' boundaries; then the nodes, for the border
// controls and the coordinates of the nodes whose ways the file gives none.
import { BorderControls, isBorderControl } from './border-controls.ts';
import { type Locate, OsmNodes, wayNodeLocator } from './osm-nodes.ts';
import type { OsmSource, OsmWay } from './osm/source.ts';
import { RepeatedIds } from './repeated-ids.ts';
import { roadOf } from './roads.ts';

export interface Scan {
	/** How many road ways the file has. */
	readonly roadWays: number;
	/** Every road node's id, once per place a road way refers to it: the ones at a junction come more than once. */
	readonly roadNodeIds: RepeatedIds;
	/** The ways of the zones' boundaries, by id. */
	readonly boundaryWays: Map<number, OsmWay>;
	/** The nodes of the roads and boundaries whose ways the file gives no locations, located by the file's nodes. */
	readonly unlocated: OsmNodes;
	readonly borderControls: BorderControls;
	/** Where a node of a road or a boundary is. */
	readonly locate: Locate;
}

/** Reads the ways, then the nodes. `boundaryWayIds`: the ways of the zones' relations. */
export function scan(source: OsmSource, boundaryWayIds: ReadonlySet<number>): Scan {
	const ways = scanWays(source, boundaryWayIds);
	const { unlocated } = ways;
	const borderControls = new BorderControls();
	source.read({
		node(node) {
			unlocated.locate(unlocated.ids.get(node.id), node.lat, node.lon);
			if (isBorderControl(node.tags)) {
				borderControls.add(node.lat, node.lon);
			}
		},
	});
	return { ...ways, borderControls, locate: wayNodeLocator(unlocated) };
}

function scanWays(source: OsmSource, boundaryWayIds: ReadonlySet<number>): Omit<Scan, 'borderControls' | 'locate'> {
	const roadNodeIds = new RepeatedIds();
	let roadWays = 0;
	const boundaryWays = new Map<number, OsmWay>();
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
	return { roadWays, roadNodeIds, boundaryWays, unlocated };
}
