// The builder's second pass over the road ways (build-graph.ts): each way cut into pieces, of which only the end
// nodes are kept, so the world's ~330 M road nodes come down to the few that may stay in the graph.
import { haversineMeters } from 'engine/geo';
import { MAX_EDGE_SECONDS, ZoneLocator, type ZoneRings } from 'engine/graph';
import { Column } from './column.ts';
import { NodeIds } from './node-ids.ts';
import type { Locate } from './osm-nodes.ts';
import type { OsmWay } from './osm/source.ts';
import type { RepeatedIds } from './repeated-ids.ts';
import type { Road } from './roads.ts';
import { BACKWARD, FORWARD, type SegmentNodes, Segments } from './segments.ts';
import { ZoneCells } from './zone-cells.ts';

/**
 * The road ways cut into pieces, each piece a chain of segments between two nodes that may stay in the graph: the
 * ways' ends, the nodes at a junction, a node next to one the file lacks, a node with a neighbour in another zone
 * or whose two neighbours are one node. A piece holds no more driving time than an edge, and one that comes back
 * to its start is cut at its second and second-to-last nodes, as `collapse` would cut such a chain. Only the
 * pieces' end nodes are kept, numbered as first met, as `collapse` takes them.
 */
export class Pieces implements SegmentNodes {
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

	/**
	 * `roadNodeIds`: every road node's id, once per place a road way refers to it. The ids that come more than once,
	 * the nodes at a junction, are kept; the rest are let go. `rings`: the graph's zones, which give each node its zone.
	 */
	constructor(roadNodeIds: RepeatedIds, rings: ZoneRings) {
		this.#junctions = roadNodeIds.repeated();
		this.#zones = new ZoneCells(new ZoneLocator(rings), rings);
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

	add(way: OsmWay, road: Road, locate: Locate): void {
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
		this.#markCuts(length);
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
			if (this.#cut[node + 1] === 1) {
				this.#segments.add(this.#node(start), this.#node(node + 1), seconds, directions);
				start = node + 1;
				seconds = 0;
			}
		}
	}

	/** Marks with 1 in `#cut` the nodes among the way's first `length` where a piece ends, with 0 the others. */
	#markCuts(length: number): void {
		const ids = this.#wayIds;
		const zone = this.#wayZone;
		const cut = this.#cut;
		cut[0] = 1;
		cut[length - 1] = 1;
		for (let node = 1; node < length - 1; node++) {
			const stays =
				zone[node - 1] !== zone[node] ||
				zone[node + 1] !== zone[node] ||
				ids[node - 1] === ids[node + 1] ||
				this.#junctions.get(ids[node]) >= 0;
			cut[node] = stays ? 1 : 0;
		}
		// A piece that comes back to its start.
		for (let end = 1, start = 0; end < length; end++) {
			if (cut[end] === 1) {
				if (ids[end] === ids[start] && end - start >= 3) {
					cut[start + 1] = 1;
					cut[end - 1] = 1;
				}
				start = end;
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
		this.#wayIds = grown(this.#wayIds, (length) => new Float64Array(length));
		this.#wayLat = grown(this.#wayLat, (length) => new Int32Array(length));
		this.#wayLon = grown(this.#wayLon, (length) => new Int32Array(length));
		this.#wayZone = grown(this.#wayZone, (length) => new Uint8Array(length));
		this.#cut = new Uint8Array(this.#cut.length * 2);
	}
}

/** A typed array twice as long as `array`, starting with its values. */
function grown<Array extends Float64Array | Int32Array | Uint8Array>(array: Array, make: (length: number) => Array): Array {
	const bigger = make(array.length * 2);
	bigger.set(array);
	return bigger;
}
