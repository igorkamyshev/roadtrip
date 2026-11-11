// The places file (spec #154 «Сборка мест», amendment «Набор данных» of spec #20, ADR 0003): the objects of OSM with a
// place's tags and wikidata=, nodes, closed ways and relations, their fame by Wikidata's sitelinks, their names by
// Wikidata's labels and ruwiki's titles, up to an area, out of the cities' limits and with access points on the
// graph's roads; and the cells of the outlines, for the origin's places. The format is `places-file.ts`.
import type { Graph } from 'engine/graph';
import { outlineAccess, pointAccess } from './access-points.ts';
import { cityAround, distanceKm, limitsKm, type Placed, type Point } from './cities-file.ts';
import { limitsGrid } from './cities.ts';
import type { OsmSource, Tags } from './osm/source.ts';
import { type Outline, outlineCells, type OutlineMember, readOutlines } from './place-outlines.ts';
import {
	type AccessPoint,
	encodePlaceOutlines,
	MIN_OUTLINE_METERS,
	mostFamousFirst,
	type Place,
	type PlaceOutline,
	PLACE_TYPES,
	type PlaceType,
} from './places-file.ts';
import { readSitelinks } from './sitelinks.ts';
import type { WikidataPlace } from './wikidata.ts';

/** A place has this many sitelinks or more. */
export const MIN_SITELINKS = 10;

/** A place with no road nearer is no place. */
export const MAX_ACCESS_METERS = 10_000;

/** A place's outline is this large or smaller: Crete and Ladoga are regions, not places. */
export const MAX_SQUARE_KM = 2000;

/** How many of the places without a Russian name the report names. */
const MOST_FAMOUS_WITHOUT_RUSSIAN = 10;

export interface PlacesSources {
	/** The objects of OSM with a place's tags (the world build's `osmium tags-filter`), or any OSM file. */
	readonly osm: OsmSource;
	/** The lines of Wikidata's dump of `wb_items_per_site`. */
	readonly sitelinks: AsyncIterable<string>;
	/** Wikidata's items by Q-id (`wikidataPlaces`), asked for the places left after the sitelinks, the cities and the roads. */
	readonly wikidata: (qids: readonly number[]) => Promise<ReadonlyMap<number, WikidataPlace>>;
	/** The graph whose roads the access points are on. */
	readonly graph: Graph;
	/** The cities of the cities file: no place is within their limits (GLOSSARY «Пределы города»). */
	readonly cities: readonly Placed[];
}

export interface PlacesReport {
	/** The objects of OSM read with a place's tags and a Q-id: nodes, closed ways and relations. */
	readonly objects: number;
	/** Left out, of fewer than MIN_SITELINKS sitelinks. */
	readonly belowSitelinks: number;
	/** Left out, ways and relations the file holds no whole outer ring of. */
	readonly withoutOutline: number;
	/** Left out, outlines over MAX_SQUARE_KM. */
	readonly tooLarge: number;
	/** Left out, within a city's limits. */
	readonly inCities: number;
	/** Left out, with no road within MAX_ACCESS_METERS. */
	readonly withoutAccess: number;
	/** Left out, places of worship and nothing else that Wikidata calls no monastery. */
	readonly notMonasteries: number;
	/** The places in the file: one per item. */
	readonly places: number;
	/** The places without a Russian name: how many, and the most famous of them with their local names. */
	readonly withoutRussian: {
		readonly count: number;
		readonly mostFamous: readonly { readonly qid: number; readonly name: string }[];
	};
	/** The cells of the outlines: how many, how many places' outlines are in them, and their files' bytes in all. */
	readonly cells: { readonly count: number; readonly outlines: number; readonly bytes: number };
}

/** An object of OSM that may be a place. */
interface Candidate {
	readonly qid: number;
	/** Of one item and type, an outline is the place before a node, a relation's before a way's. */
	readonly kind: 'relation' | 'way' | 'node';
	readonly osmId: number;
	/** OSM's `name`, or empty. */
	readonly name: string;
	/** A node's point, degrees; undefined for an outline. */
	readonly point: Point | undefined;
	/** The ways of an outline: a closed way's own, a relation's members. */
	readonly members: readonly OutlineMember[];
	/** Its type if its item is a monastery (Q44613), which only Wikidata tells. */
	readonly ifMonastery: PlaceType;
	/** Its type if not; undefined for a place of worship and nothing else, which then is no place. */
	readonly otherwise: PlaceType | undefined;
}

/** A candidate with where it is: its node's point, or its outline and a point inside it. */
interface Located {
	readonly candidate: Candidate;
	readonly point: Point;
	readonly outline: Outline | undefined;
}

/** A located object that is a place, with what Wikidata and the roads say of it. */
interface Typed extends Located {
	readonly type: PlaceType;
	readonly access: readonly AccessPoint[];
}

const KIND_ORDER = ['relation', 'way', 'node'] as const;

/**
 * The places of the file (`encodePlaces` writes it), the most famous first, the cells of their outlines by name
 * (`placeOutlinesCell`; `encodePlaceOutlines` writes each), and what the build did.
 */
export async function buildPlaces(
	sources: PlacesSources,
): Promise<{ places: Place[]; cells: Map<string, PlaceOutline[]>; report: PlacesReport }> {
	const candidates = readCandidates(sources.osm);
	const sitelinks = await readSitelinks(sources.sitelinks, new Set(candidates.map(({ qid }) => qid)));
	const famous = candidates.filter(({ qid }) => (sitelinks.get(qid)?.count ?? 0) >= MIN_SITELINKS);
	const located = locate(sources.osm, famous);
	const small = located.filter(({ outline }) => (outline?.squareMeters ?? 0) <= MAX_SQUARE_KM * 1e6);
	const citiesNear = limitsGrid(sources.cities);
	const outOfCities = small.filter((place) => !withinCity(citiesNear, place));
	const accessOf = placeAccess(sources.graph, outOfCities);
	const reached = outOfCities.map((place) => ({ ...place, access: accessOf(place) })).filter(({ access }) => access.length > 0);
	const items = await sources.wikidata([...new Set(reached.map(({ candidate }) => candidate.qid))]);
	const { typed, notMonasteries } = onePerItem(reached, items);
	const places = typed
		.map((place) => placeOf(place, items.get(place.candidate.qid), sitelinks.get(place.candidate.qid)))
		.toSorted(mostFamousFirst);
	const outlines = typed.flatMap(({ candidate, outline }) =>
		outline !== undefined && outline.acrossMeters >= MIN_OUTLINE_METERS && outline.rings.length > 0
			? [{ qid: candidate.qid, rings: outline.rings }]
			: [],
	);
	const cells = outlineCells(outlines);
	const withoutRussian = places.filter(({ ru }) => ru === '');
	return {
		places,
		cells,
		report: {
			objects: candidates.length,
			belowSitelinks: candidates.length - famous.length,
			withoutOutline: famous.length - located.length,
			tooLarge: located.length - small.length,
			inCities: small.length - outOfCities.length,
			withoutAccess: outOfCities.length - reached.length,
			notMonasteries,
			places: places.length,
			withoutRussian: {
				count: withoutRussian.length,
				mostFamous: withoutRussian.slice(0, MOST_FAMOUS_WITHOUT_RUSSIAN).map(({ qid, local }) => ({ qid, name: local })),
			},
			cells: {
				count: cells.size,
				outlines: outlines.length,
				bytes: [...cells.values()].reduce((sum, cell) => sum + JSON.stringify(encodePlaceOutlines(cell)).length, 0),
			},
		},
	};
}

/** A place of the file: at its node's point, or at Wikidata's P625, else a point inside its outline. */
function placeOf(place: Typed, item: WikidataPlace | undefined, links: { count: number; ruwiki?: string } | undefined): Place {
	const { candidate, type, access } = place;
	const point = (place.outline === undefined ? undefined : item?.point) ?? place.point;
	return {
		qid: candidate.qid,
		ru: russianName(item?.ru, links?.ruwiki),
		local: item?.en ?? candidate.name,
		lat: round(point.lat),
		lon: round(point.lon),
		sitelinks: links?.count ?? 0,
		type,
		access,
	};
}

/** The candidates with where they are: a node at its point, an outline read from the file; one with none left out. */
function locate(osm: OsmSource, candidates: readonly Candidate[]): Located[] {
	const outlined = candidates.filter(({ point }) => point === undefined);
	const outlines = new Map(
		readOutlines(
			osm,
			outlined.map(({ members }) => members),
		).map((outline, index) => [outlined[index], outline]),
	);
	return candidates.flatMap((candidate): Located[] => {
		if (candidate.point !== undefined) {
			return [{ candidate, point: candidate.point, outline: undefined }];
		}
		const outline = outlines.get(candidate);
		return outline === undefined ? [] : [{ candidate, point: outline.inside, outline }];
	});
}

/**
 * Whether a place is within a city's limits (GLOSSARY «Пределы города»): its point, or its whole outline in one
 * city's, the place itself and not its access points.
 */
function withinCity(citiesNear: (at: Point) => readonly Placed[], { point, outline }: Located): boolean {
	const vertices = (outline?.rings ?? []).flatMap((ring) =>
		ring.flatMap((lat, index) => (index % 2 === 0 ? [{ lat, lon: ring[index + 1] }] : [])),
	);
	if (vertices.length === 0) {
		return cityAround(citiesNear(point), point) !== undefined;
	}
	return citiesNear(vertices[0]).some((city) => vertices.every((vertex) => distanceKm(vertex, city) <= limitsKm(city.population)));
}

/**
 * The access points of the places (GLOSSARY «Подъезд»): of an outline, the roads inside it and near its edge
 * (`outlineAccess`), else, as of a node, the nearest road in each zone within MAX_ACCESS_METERS of its point.
 */
function placeAccess(graph: Graph, places: readonly Located[]): (place: Located) => AccessPoint[] {
	const outlines = places.flatMap(({ outline }) => (outline === undefined ? [] : [outline]));
	const ofOutline = outlineAccess(graph, outlines);
	const ofPoint = pointAccess(
		graph,
		places.map(({ point }) => point),
		MAX_ACCESS_METERS,
	);
	return ({ point, outline }) => {
		const inside = outline === undefined ? [] : ofOutline(outline);
		return inside.length > 0 ? inside : ofPoint(point);
	};
}

/** The places typed by their tags and Wikidata's Q44613, one per item, and how many places of worship are no monastery. */
function onePerItem(
	reached: readonly (Located & { access: readonly AccessPoint[] })[],
	items: ReadonlyMap<number, WikidataPlace>,
): { typed: Typed[]; notMonasteries: number } {
	const byItem = new Map<number, Typed>();
	let notMonasteries = 0;
	for (const place of reached) {
		const { candidate } = place;
		const type = items.get(candidate.qid)?.monastery === true ? candidate.ifMonastery : candidate.otherwise;
		if (type === undefined) {
			notMonasteries += 1;
			continue;
		}
		const current = byItem.get(candidate.qid);
		if (current === undefined || comesBefore({ candidate, type }, current)) {
			byItem.set(candidate.qid, { ...place, type });
		}
	}
	return { typed: [...byItem.values()], notMonasteries };
}

/**
 * Of two objects of one item, whether the one is the place: of the type that comes first, then an outline before a
 * node (`KIND_ORDER`), then of the smaller id in OSM.
 */
function comesBefore(one: Pick<Typed, 'candidate' | 'type'>, two: Pick<Typed, 'candidate' | 'type'>): boolean {
	const byType = PLACE_TYPES.indexOf(one.type) - PLACE_TYPES.indexOf(two.type);
	const order = byType === 0 ? KIND_ORDER.indexOf(one.candidate.kind) - KIND_ORDER.indexOf(two.candidate.kind) : byType;
	return order === 0 ? one.candidate.osmId < two.candidate.osmId : order < 0;
}

/** The nodes, closed ways and relations of OSM with a place's tags and a Q-id in wikidata=; an open way is no area. */
function readCandidates(osm: OsmSource): Candidate[] {
	const candidates: Candidate[] = [];
	const add = (tags: Tags, object: Pick<Candidate, 'kind' | 'osmId' | 'point' | 'members'>) => {
		const qid = Number(/^Q([1-9]\d*)$/u.exec(tags.wikidata ?? '')?.[1]);
		const ifMonastery = placeType(tags, true);
		if (Number.isInteger(qid) && ifMonastery !== undefined) {
			candidates.push({ qid, name: tags.name ?? '', ...object, ifMonastery, otherwise: placeType(tags, false) });
		}
	};
	osm.read({
		node({ id, lat, lon, tags }) {
			add(tags, { kind: 'node', osmId: id, point: { lat: lat / 1e7, lon: lon / 1e7 }, members: [] });
		},
		way({ id, refs, tags }) {
			if (refs.length >= 4 && refs[0] === refs.at(-1)) {
				add(tags, { kind: 'way', osmId: id, point: undefined, members: [{ id, inner: false }] });
			}
		},
		relation({ id, members, tags }) {
			const ways = members.filter(({ type }) => type === 'way').map(({ ref, role }) => ({ id: ref, inner: role === 'inner' }));
			add(tags, { kind: 'relation', osmId: id, point: undefined, members: ways });
		},
	});
	return candidates;
}

/** A value of a tag among `values`. */
const oneOf = (value: string | undefined, values: readonly string[]) => value !== undefined && values.includes(value);

/** IUCN's categories Ia to V, of the national parks among the protected areas. */
const NATIONAL_PARK_CLASS = /^[1-5][ab]?$/u;

/**
 * The tags of each type (amendment «Набор данных» of spec #20): a place of worship (`amenity=place_of_worship`) is a
 * monastery only when Wikidata calls its item one, `worshipIsMonastery`. Not `tourism=attraction` or
 * `tourism=viewpoint`, valleys, ranges, rivers or hot springs. A castle in ruins is a castle: castles come before ruins.
 */
const TYPE_TAGS: Readonly<Record<PlaceType, (tags: Tags, worshipIsMonastery: boolean) => boolean>> = {
	'national-park': (tags) =>
		tags.boundary === 'national_park' ||
		tags.leisure === 'nature_reserve' ||
		(tags.boundary === 'protected_area' && NATIONAL_PARK_CLASS.test(tags.protect_class ?? '')),
	mountain: (tags) => oneOf(tags.natural, ['peak', 'volcano', 'glacier']) || tags.mountain_pass === 'yes',
	canyon: (tags) => tags.natural === 'gorge',
	waterfall: (tags) => tags.waterway === 'waterfall',
	cave: (tags) => tags.natural === 'cave_entrance',
	lake: (tags) => tags.natural === 'water' && oneOf(tags.water, ['lake', 'reservoir']),
	beach: (tags) => tags.natural === 'beach',
	island: (tags) => tags.place === 'island',
	monastery: (tags, worshipIsMonastery) =>
		tags.amenity === 'monastery' ||
		tags.historic === 'monastery' ||
		tags.building === 'monastery' ||
		(worshipIsMonastery && tags.amenity === 'place_of_worship'),
	castle: (tags) => oneOf(tags.historic, ['castle', 'fort']),
	ruins: (tags) => oneOf(tags.historic, ['archaeological_site', 'ruins']),
};

/** The type of an object by its tags, the first in the order of precedence; undefined for none. */
function placeType(tags: Tags, worshipIsMonastery: boolean): PlaceType | undefined {
	return PLACE_TYPES.find((type) => TYPE_TAGS[type](tags, worshipIsMonastery));
}

/** A qualifier in brackets at the end of a title: «Д'Арк (гора)». */
const QUALIFIER = /\s*\([^)]*\)$/u;

/** The Russian name (ADR 0003): Wikidata's Russian label, else ruwiki's title without its qualifier, from a capital letter; empty for none. */
function russianName(label: string | undefined, ruwiki: string | undefined): string {
	const name = (label ?? ruwiki?.replace(QUALIFIER, '') ?? '').trim();
	return name.charAt(0).toLocaleUpperCase('ru') + name.slice(1);
}

/** Degrees to 0.001°, about 100 m. */
function round(degrees: number): number {
	return Math.round(degrees * 1000) / 1000;
}
