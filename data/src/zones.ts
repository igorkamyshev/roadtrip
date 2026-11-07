// The zones of the graph (spec «Набор данных», «Зоны»): countries by their admin_level=2 polygons, and the special
// cases of #13 by relation id.
import type { ZoneRings } from 'engine/graph';
import type { OsmRelation, Tags } from './osm/source.ts';

/**
 * The relations that make a zone other than by their own tags (#13), checked in OSM on 2026-11-07. The world
 * build's `osmium tags-filter` keeps these as well as the admin_level=2 relations. Transnistria needs no line:
 * it is admin_level=4 (r2607033) inside Moldova (r58974), so part of MDA.
 */
export const SPECIAL_ZONES: ReadonlyMap<number, string> = new Map([
	// Kosovo: admin_level=2 with ISO3166-1:alpha3=XKK; Sherpa's code is RKS.
	[2088990, 'RKS'],
	// Northern Cyprus: admin_level=3 inside Cyprus (r307787); Sherpa's code is NX.
	[2514541, 'NX'],
	// Akrotiri and Dhekelia: admin_level=2 without an ISO code, part of Cyprus.
	[3263728, 'CYP'],
	// Crimea, closed: the Autonomous Republic and Sevastopol, admin_level=4 of Ukraine (r60199), both also inside
	// Russia (r60189).
	[72639, 'CRIMEA'],
	[1574364, 'CRIMEA'],
	// Abkhazia and South Ossetia, closed: admin_level=3 inside Georgia (r28699).
	[1152720, 'ABKHAZIA'],
	[1152717, 'SOUTH_OSSETIA'],
	// The Gaza Strip, closed: admin_level=4, in no country's polygon.
	[1473938, 'GAZA'],
	// All of Western Sahara, closed: no admin_level, over Morocco (r3630439) west of the wall and r5441968 east.
	[2559126, 'WESTERN_SAHARA'],
]);

/**
 * The zone a relation makes, or undefined when it makes none. `part` is true for a part of a country (a relation
 * below admin_level 2): the graph lists such zones before the countries, so where one lies inside its country's
 * polygon, a point there is in the part (ZoneLocator takes the first zone that holds a point).
 */
export function zoneOf(relation: OsmRelation): { code: string; part: boolean } | undefined {
	const tags: Tags = relation.tags;
	const special = SPECIAL_ZONES.get(relation.id);
	if (special !== undefined) {
		return { code: special, part: tags.admin_level !== '2' };
	}
	const code = tags['ISO3166-1:alpha3'];
	if (tags.boundary !== 'administrative' || tags.admin_level !== '2' || code === undefined) {
		return undefined;
	}
	return { code, part: false };
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
