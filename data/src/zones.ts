// The zones of the graph (spec #20 «Набор данных», «Зоны»): countries by their admin_level=2 polygons, and the special
// cases of #13 by relation id.
import { MAX_ZONES, type ZoneRings } from 'engine/graph';
import type { Locate } from './osm-nodes.ts';
import type { OsmRelation, OsmSource, OsmWay, Tags } from './osm/source.ts';

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
function zoneOf(relation: OsmRelation): { code: string; part: boolean } | undefined {
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

export interface ZoneRelation {
	readonly code: string;
	readonly part: boolean;
	/** The relation's ways, and whether each bounds a hole (role `inner`). */
	readonly ways: readonly { readonly id: number; readonly inner: boolean }[];
}

/** The relations of the file that make a zone. */
export function readZoneRelations(source: OsmSource): ZoneRelation[] {
	const relations: ZoneRelation[] = [];
	source.read({
		relation(relation) {
			const zone = zoneOf(relation);
			if (zone !== undefined) {
				const ways = relation.members
					.filter((member) => member.type === 'way')
					.map((member) => ({ id: member.ref, inner: member.role === 'inner' }));
				relations.push({ ...zone, ways });
			}
		},
	});
	return relations;
}

/** The zones the relations make of the extract's boundary ways, and those it holds in part or not at all. */
export interface FoundZones {
	/** The closed rings of each zone. */
	readonly ringsByZone: ReadonlyMap<string, readonly Chain[]>;
	/** Zones of which the extract holds no whole ring but holes: they are left out. */
	readonly incompleteZones: ReadonlySet<string>;
	/** Zones of which the extract holds some rings whole and not others, which are left out. */
	readonly partialZones: ReadonlySet<string>;
}

/**
 * The rings of each relation that the extract holds whole. A way the extract lacks, or one with a node it lacks,
 * leaves its ring out; a zone of no ring but holes is left out.
 */
export function findZones(relations: readonly ZoneRelation[], boundaryWays: ReadonlyMap<number, OsmWay>, locate: Locate): FoundZones {
	const ringsByZone = new Map<string, Chain[]>();
	const incompleteZones = new Set<string>();
	const partialZones = new Set<string>();
	for (const relation of relations) {
		const { rings, whole } = relationRings(relation.ways, boundaryWays, locate);
		if (!rings.some((ring) => !ring.inner)) {
			incompleteZones.add(relation.code);
			continue;
		}
		if (!whole) {
			partialZones.add(relation.code);
		}
		ringsByZone.set(relation.code, [...(ringsByZone.get(relation.code) ?? []), ...rings]);
	}
	return { ringsByZone, incompleteZones, partialZones };
}

/**
 * The closed rings that a relation's ways make, joined end to end (a zone's, or a place's outline, places.ts), and
 * whether they are all of it: a way the file lacks, or one with a node it lacks, leaves its ring out.
 */
export function relationRings(
	members: readonly { readonly id: number; readonly inner: boolean }[],
	ways: ReadonlyMap<number, OsmWay>,
	locate: Locate,
): { rings: Chain[]; whole: boolean } {
	const located = members.flatMap(({ id, inner }) => {
		const way = ways.get(id);
		const boundary = way === undefined ? undefined : locatedWay(way, inner, locate);
		return boundary === undefined ? [] : [boundary];
	});
	const { rings, open } = joinRings(located);
	return { rings, whole: open === 0 && located.length === members.length };
}

/** A boundary way with its nodes' coordinates, or undefined when the file lacks one of them. */
function locatedWay(way: OsmWay, inner: boolean, locate: Locate): BoundaryWay | undefined {
	const lat: number[] = [];
	const lon: number[] = [];
	const point = new Int32Array(2);
	for (let index = 0; index < way.refs.length; index++) {
		if (!locate(way, index, point)) {
			return undefined;
		}
		lat.push(point[0]);
		lon.push(point[1]);
	}
	return { refs: way.refs, lat, lon, inner };
}

/**
 * The graph's zones in order, by their codes: '' (no zone) first, then the parts of countries, so they win over the
 * country around them, then the countries.
 */
export function graphZones(codes: readonly string[], parts: ReadonlySet<string>): string[] {
	const zones = ['', ...codes.filter((code) => parts.has(code)), ...codes.filter((code) => !parts.has(code))];
	if (zones.length > MAX_ZONES + 1) {
		throw new RangeError(`${zones.length - 1} zones, more than a node's zone byte holds`);
	}
	return zones;
}

/** A way of a zone's boundary: its node ids and their coordinates (1e-7 degrees), and whether it bounds a hole. */
interface BoundaryWay {
	readonly refs: readonly number[];
	readonly lat: readonly number[];
	readonly lon: readonly number[];
	/** The way's role in the relation is `inner`. */
	readonly inner: boolean;
}

/** A chain of nodes, a ring once closed: their ids and coordinates (1e-7 degrees). */
export interface Chain {
	refs: number[];
	lat: number[];
	lon: number[];
	/** Every way of the chain is `inner`: a hole, or an enclave inside one. */
	inner: boolean;
}

/**
 * The closed rings the ways make when joined end to end, and how many chains of ways do not close. Those are left
 * out: the extract holds only part of the zone's boundary there, as for a neighbour at the edge of a country's
 * extract, or for the USA, whose boundary around two remote atolls is in no part of the world.
 */
function joinRings(ways: readonly BoundaryWay[]): { rings: Chain[]; open: number } {
	const rings: Chain[] = [];
	const open: Chain[] = [];
	for (const way of ways) {
		const chain = chainOf(way);
		(isClosed(chain) ? rings : open).push(chain);
	}
	const used = new Set<Chain>();
	let unclosed = 0;
	for (const start of open) {
		if (used.has(start)) {
			continue;
		}
		used.add(start);
		const ring = joinedFrom(start, open, used);
		if (isClosed(ring)) {
			rings.push(ring);
		} else {
			unclosed++;
		}
	}
	return { rings, open: unclosed };
}

/** A chain of its own of the way's nodes. */
function chainOf(way: BoundaryWay): Chain {
	return { refs: [...way.refs], lat: [...way.lat], lon: [...way.lon], inner: way.inner };
}

/** The chain from `start` on, joined end to end with the chains of `open` not `used` yet, until it closes or stops. */
function joinedFrom(start: Chain, open: readonly Chain[], used: Set<Chain>): Chain {
	const ring = chainOf(start);
	while (!isClosed(ring)) {
		const end = ring.refs.at(-1);
		const next = open.find((chain) => !used.has(chain) && (chain.refs[0] === end || chain.refs.at(-1) === end));
		if (next === undefined) {
			break;
		}
		used.add(next);
		append(ring, next, next.refs[0] !== end);
		ring.inner &&= next.inner;
	}
	return ring;
}

/** Appends the nodes of `next`, reversed or not, to `ring`, without the first, which is the ring's last. */
function append(ring: Chain, next: Chain, reversed: boolean): void {
	const order = (values: number[]) => (reversed ? values.toReversed() : values).slice(1);
	// A loop, not push(...): a chain of a country's ways can outgrow the argument limit.
	for (const [values, more] of [
		[ring.refs, order(next.refs)],
		[ring.lat, order(next.lat)],
		[ring.lon, order(next.lon)],
	]) {
		for (const value of more) {
			values.push(value);
		}
	}
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
