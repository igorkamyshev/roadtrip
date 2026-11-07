// The zones of the graph: countries by their admin_level=2 polygons (spec «Набор данных», «Зоны»). The special
// cases of #13 (Kosovo, Northern Cyprus, closed territories) come with the borders ticket (#23).
import type { ZoneRings } from 'engine/graph';
import type { OsmRelation, Tags } from './osm/source.ts';

/** The zone code of a relation, or undefined when the relation is no zone's polygon. */
export function zoneCodeOf(relation: OsmRelation): string | undefined {
	const tags: Tags = relation.tags;
	if (tags.boundary !== 'administrative' || tags.admin_level !== '2') {
		return undefined;
	}
	return tags['ISO3166-1:alpha3'];
}

/** A way of a zone's boundary: its node ids and their coordinates (1e-7 degrees). */
export interface BoundaryWay {
	readonly refs: readonly number[];
	readonly lat: readonly number[];
	readonly lon: readonly number[];
}

interface Chain {
	refs: number[];
	lat: number[];
	lon: number[];
}

/**
 * The closed rings the ways make when joined end to end, or undefined when some do not close: the extract holds
 * only part of the zone's boundary, as for a neighbour at the edge of a country's extract.
 */
export function joinRings(ways: readonly BoundaryWay[]): Chain[] | undefined {
	const rings: Chain[] = [];
	const open: Chain[] = [];
	for (const way of ways) {
		const chain = { refs: [...way.refs], lat: [...way.lat], lon: [...way.lon] };
		(isClosed(chain) ? rings : open).push(chain);
	}
	const used = new Set<Chain>();
	for (const start of open) {
		if (used.has(start)) {
			continue;
		}
		used.add(start);
		const ring: Chain = { refs: [...start.refs], lat: [...start.lat], lon: [...start.lon] };
		while (!isClosed(ring)) {
			const end = ring.refs.at(-1);
			const next = open.find((chain) => !used.has(chain) && (chain.refs[0] === end || chain.refs.at(-1) === end));
			if (next === undefined) {
				return undefined;
			}
			used.add(next);
			const reversed = next.refs[0] !== end;
			const order = (values: number[]) => (reversed ? [...values].reverse() : values).slice(1);
			ring.refs.push(...order(next.refs));
			ring.lat.push(...order(next.lat));
			ring.lon.push(...order(next.lon));
		}
		rings.push(ring);
	}
	return rings;
}

function isClosed(chain: Chain): boolean {
	return chain.refs.length >= 4 && chain.refs[0] === chain.refs.at(-1);
}

/** The rings of each zone in the arrays of the graph format, zone indexes by `zones` (index 0 is no zone). */
export function zoneRings(ringsByZone: ReadonlyMap<string, readonly Chain[]>, zones: readonly string[]): ZoneRings {
	const ringZone: number[] = [];
	const start = [0];
	const lat: number[] = [];
	const lon: number[] = [];
	for (const [code, rings] of ringsByZone) {
		for (const ring of rings) {
			ringZone.push(zones.indexOf(code));
			// A loop, not push(...): a country's ring can outgrow the argument limit.
			for (let point = 0; point < ring.lat.length; point++) {
				lat.push(ring.lat[point]);
				lon.push(ring.lon[point]);
			}
			start.push(lat.length);
		}
	}
	return {
		zone: Uint8Array.from(ringZone),
		start: Uint32Array.from(start),
		lat: Int32Array.from(lat),
		lon: Int32Array.from(lon),
	};
}
