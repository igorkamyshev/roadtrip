// The places file (spec #154 «Сборка мест», amendment «Набор данных» of spec #20, ADR 0003): the objects of OSM with a
// place's tags and wikidata=, their fame by Wikidata's sitelinks, their names by Wikidata's labels and ruwiki's
// titles, out of the cities' limits and with access points on the graph's roads. The format is `places-file.ts`.
// The places with an outline (lakes, national parks, islands as areas) are #157's: here only nodes are read.
import type { Graph } from 'engine/graph';
import { pointAccess } from './access-points.ts';
import { cityAround, type Placed } from './cities-file.ts';
import { limitsGrid } from './cities.ts';
import type { OsmSource, Tags } from './osm/source.ts';
import { type AccessPoint, mostFamousFirst, type Place, PLACE_TYPES, type PlaceType } from './places-file.ts';
import { readSitelinks } from './sitelinks.ts';
import type { WikidataPlace } from './wikidata.ts';

/** A place has this many sitelinks or more. */
export const MIN_SITELINKS = 10;

/** A place with no road nearer is no place. */
export const MAX_ACCESS_METERS = 10_000;

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
	/** The table of Russian names of places (`readPlaceRussianNames`), which the deploy puts in: the file leaves it out, the report counts the places it lacks. */
	readonly russianNames: ReadonlyMap<number, string>;
}

export interface PlacesReport {
	/** The objects of OSM read with a place's tags and a Q-id. */
	readonly objects: number;
	/** Left out, of fewer than MIN_SITELINKS sitelinks. */
	readonly belowSitelinks: number;
	/** Left out, within a city's limits. */
	readonly inCities: number;
	/** Left out, with no road within MAX_ACCESS_METERS. */
	readonly withoutAccess: number;
	/** Left out, places of worship and nothing else that Wikidata calls no monastery. */
	readonly notMonasteries: number;
	/** The places in the file: one per item. */
	readonly places: number;
	/** The places without a Russian name that the table of Russian names lacks: how many, and the most famous of them with their local names. */
	readonly withoutRussian: {
		readonly count: number;
		readonly mostFamous: readonly { readonly qid: number; readonly name: string }[];
	};
}

/** An object of OSM that may be a place. */
interface Candidate {
	readonly qid: number;
	readonly osmId: number;
	/** OSM's `name`, or empty. */
	readonly name: string;
	/** Degrees. */
	readonly lat: number;
	readonly lon: number;
	/** Its type if its item is a monastery (Q44613), which only Wikidata tells. */
	readonly ifMonastery: PlaceType;
	/** Its type if not; undefined for a place of worship and nothing else, which then is no place. */
	readonly otherwise: PlaceType | undefined;
}

/** An object that is a place, with what Wikidata and the roads say of it. */
interface Typed {
	readonly candidate: Candidate;
	readonly type: PlaceType;
	readonly access: readonly AccessPoint[];
}

/** The places of the file (`encodePlaces` writes it), the most famous first, and what the build did. */
export async function buildPlaces(sources: PlacesSources): Promise<{ places: Place[]; report: PlacesReport }> {
	const candidates = readCandidates(sources.osm);
	const sitelinks = await readSitelinks(sources.sitelinks, new Set(candidates.map(({ qid }) => qid)));
	const famous = candidates.filter(({ qid }) => (sitelinks.get(qid)?.count ?? 0) >= MIN_SITELINKS);
	const citiesNear = limitsGrid(sources.cities);
	const outOfCities = famous.filter((candidate) => cityAround(citiesNear(candidate), candidate) === undefined);
	const accessOf = pointAccess(sources.graph, outOfCities, MAX_ACCESS_METERS);
	const reached = outOfCities.map((candidate) => ({ candidate, access: accessOf(candidate) })).filter(({ access }) => access.length > 0);
	const items = await sources.wikidata([...new Set(reached.map(({ candidate }) => candidate.qid))]);

	const byItem = new Map<number, Typed>();
	let notMonasteries = 0;
	for (const { candidate, access } of reached) {
		const type = items.get(candidate.qid)?.monastery === true ? candidate.ifMonastery : candidate.otherwise;
		if (type === undefined) {
			notMonasteries += 1;
			continue;
		}
		const current = byItem.get(candidate.qid);
		if (current === undefined || comesBefore({ candidate, type }, current)) {
			byItem.set(candidate.qid, { candidate, type, access });
		}
	}
	const places = [...byItem.values()]
		.map(({ candidate, type, access }): Place => {
			const item = items.get(candidate.qid);
			const links = sitelinks.get(candidate.qid);
			return {
				qid: candidate.qid,
				ru: russianName(item?.ru, links?.ruwiki),
				local: item?.en ?? candidate.name,
				lat: round(candidate.lat),
				lon: round(candidate.lon),
				sitelinks: links?.count ?? 0,
				type,
				access,
			};
		})
		.toSorted(mostFamousFirst);
	const withoutRussian = places.filter(({ qid, ru }) => ru === '' && !sources.russianNames.has(qid));
	return {
		places,
		report: {
			objects: candidates.length,
			belowSitelinks: candidates.length - famous.length,
			inCities: famous.length - outOfCities.length,
			withoutAccess: outOfCities.length - reached.length,
			notMonasteries,
			places: places.length,
			withoutRussian: {
				count: withoutRussian.length,
				mostFamous: withoutRussian.slice(0, MOST_FAMOUS_WITHOUT_RUSSIAN).map(({ qid, local }) => ({ qid, name: local })),
			},
		},
	};
}

/** Of two objects of one item, whether the one is the place: of the type that comes first, then of the smaller id in OSM. */
function comesBefore(one: Omit<Typed, 'access'>, two: Omit<Typed, 'access'>): boolean {
	const order = PLACE_TYPES.indexOf(one.type) - PLACE_TYPES.indexOf(two.type);
	return order === 0 ? one.candidate.osmId < two.candidate.osmId : order < 0;
}

/** The nodes of OSM with a place's tags and a Q-id in wikidata=. */
function readCandidates(osm: OsmSource): Candidate[] {
	const candidates: Candidate[] = [];
	osm.read({
		node({ id, lat, lon, tags }) {
			const qid = Number(/^Q([1-9]\d*)$/u.exec(tags.wikidata ?? '')?.[1]);
			const ifMonastery = placeType(tags, true);
			if (!Number.isInteger(qid) || ifMonastery === undefined) {
				return;
			}
			candidates.push({
				qid,
				osmId: id,
				name: tags.name ?? '',
				lat: lat / 1e7,
				lon: lon / 1e7,
				ifMonastery,
				otherwise: placeType(tags, false),
			});
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
