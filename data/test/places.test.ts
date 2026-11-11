// The build of the places file (spec #154 «Сборка мест», amendment «Набор данных» of spec #20): the places of
// fixtures/places.osm (its header has the layout and the distances), their sitelinks from a tiny dump, a double of
// Wikidata's Query Service, and two cities.
import { describe, expect, it } from 'vitest';
import type { Place } from '../src/places-file.ts';
import { openOsm } from '../src/osm/open.ts';
import { buildPlaces, type PlacesSources } from '../src/places.ts';
import type { WikidataPlace } from '../src/wikidata.ts';
import { fixtureGraph, fixturePath } from './fixture-graph.ts';
import { PLACES_SITELINKS, type ItemSitelinks, sitelinksDump } from './sitelinks-dump.ts';

const graph = fixtureGraph('places.osm');

/** The cities of the fixture's header. */
const CITIES = [
	{ lat: 0.7, lon: 0.93, population: 1_000_000 },
	{ lat: 0.25, lon: 0.95, population: 250_000 },
];

/** What the double of Wikidata knows of each item. */
const ITEMS: Readonly<Partial<Record<number, Partial<WikidataPlace>>>> = {
	1001: { ru: 'Пограничный водопад', en: 'Border Falls' },
	1005: { ru: 'Замок Каштел', en: 'Castle Hill' },
	1006: { ru: 'монастырь Святого Саввы', monastery: true },
	1008: { en: 'Old Church' },
	1010: { en: 'Bee Reserve' },
	1012: { ru: 'Озеро Ле' },
	1004: { en: 'High Peak' },
};

/** The double of Wikidata, recording the Q-ids it is asked for. */
function wikidata(asked: number[][] = []): PlacesSources['wikidata'] {
	return (qids) => {
		asked.push([...qids]);
		return Promise.resolve(
			new Map(
				qids.map((qid) => {
					const { ru, en, monastery = false } = ITEMS[qid] ?? {};
					return [qid, { ru, en, point: undefined, monastery }];
				}),
			),
		);
	};
}

function build(sitelinks: Readonly<Record<number, ItemSitelinks>> = PLACES_SITELINKS, asked: number[][] = []) {
	return buildPlaces({
		osm: openOsm(fixturePath('places.osm')),
		sitelinks: ReadableStream.from(sitelinksDump(sitelinks)),
		wikidata: wikidata(asked),
		graph,
		cities: CITIES,
	});
}

/** The places by Q-id. */
const byQid = (places: readonly Place[]) => new Map(places.map((place) => [place.qid, place]));

describe('the places', () => {
	it('are the objects with a place’s tags from 10 sitelinks, out of the cities, with a road within 10 km, the most famous first', async () => {
		const { places } = await build();

		expect(places.map(({ qid, sitelinks }) => [qid, sitelinks])).toEqual([
			[1001, 30],
			[1010, 25],
			[1006, 20],
			[1008, 15],
			[1012, 12],
			[1005, 11],
			[1004, 10],
		]);
	});

	it('are typed by their tags, the first type of several in the order of precedence', async () => {
		const places = byQid((await build()).places);

		expect([...places.values()].map(({ qid, type }) => [qid, type])).toEqual([
			[1001, 'waterfall'],
			[1010, 'national-park'],
			[1006, 'monastery'],
			[1008, 'ruins'],
			[1012, 'lake'],
			[1005, 'castle'],
			[1004, 'mountain'],
		]);
	});

	it('take one object of an item, of the type that comes first, at its point', async () => {
		const lake = byQid((await build()).places).get(1012);

		expect(lake).toMatchObject({ type: 'lake', lat: 0.6, lon: 1.13 });
	});

	it('get the nearest point of a road in each country within 10 km, the nearest first', async () => {
		const places = byQid((await build()).places);

		expect(places.get(1001)?.access).toEqual([
			{ lat: 0.45, lon: 1.08, zone: 'BBB' },
			{ lat: 0.45, lon: 0.93, zone: 'AAA' },
		]);
		expect(places.get(1010)?.access).toEqual([{ lat: 0.2, lon: 1.08, zone: 'BBB' }]);
		// Its access point is within the limits of the city of 250 000, the place itself is not.
		expect(places.get(1006)?.access).toEqual([{ lat: 0.25, lon: 0.93, zone: 'AAA' }]);
	});

	it('are named in Russian by Wikidata’s label, else ruwiki’s title without its qualifier, from a capital letter; locally by the English label, else OSM’s name', async () => {
		const places = byQid((await build()).places);

		expect([...places.values()].map(({ qid, ru, local }) => [qid, ru, local])).toEqual([
			[1001, 'Пограничный водопад', 'Border Falls'],
			[1010, 'Заповедник Би', 'Bee Reserve'],
			[1006, 'Монастырь Святого Саввы', 'Manastir Svetog Save'],
			[1008, '', 'Old Church'],
			[1012, 'Озеро Ле', 'Jezero Le'],
			[1005, 'Замок Каштел', 'Castle Hill'],
			[1004, "Д'Арк", 'High Peak'],
		]);
	});

	it('ask Wikidata only of the items left after the sitelinks, the cities and the roads', async () => {
		const asked: number[][] = [];

		await build(PLACES_SITELINKS, asked);

		expect(asked.flat().toSorted((one, two) => one - two)).toEqual([1001, 1004, 1005, 1006, 1007, 1008, 1010, 1012]);
	});

	it('leave out an item of fewer than 10 sitelinks', async () => {
		const { places } = await build({ ...PLACES_SITELINKS, 1004: { count: 9 } });

		expect(places.map(({ qid }) => qid)).not.toContain(1004);
	});
});

describe('the report of the places', () => {
	it('counts what was left out and the places without a Russian name, the most famous of them named', async () => {
		const { report } = await build();

		expect(report).toEqual({
			objects: 12,
			belowSitelinks: 1,
			inCities: 1,
			withoutAccess: 1,
			notMonasteries: 1,
			places: 7,
			withoutRussian: { count: 1, mostFamous: [{ qid: 1008, name: 'Old Church' }] },
		});
	});
});
