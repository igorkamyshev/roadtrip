// The build of the places file (spec #154 «Сборка мест», amendment «Набор данных» of spec #20): the places of
// fixtures/places.osm (its header has the layout and the distances), their sitelinks from a tiny dump, a double of
// Wikidata's Query Service, and two cities.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlaceDecision } from '../src/place-exclusions.ts';
import type { Place } from '../src/places-file.ts';
import { openOsm } from '../src/osm/open.ts';
import { placesMarkdown } from '../src/build-report.ts';
import { buildPlaces, placeFilterTags, type PlacesSources } from '../src/places.ts';
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
	1001: { ru: 'Пограничный водопад', en: 'Border Falls', instanceOf: ['waterfall', 'municipality'], doubts: ['settlement'] },
	// A castle whose item is the village it is in.
	1005: { ru: 'Замок Каштел', en: 'Castle Hill', instanceOf: ['village', 'civil parish'], doubts: ['settlement'] },
	1006: { ru: 'монастырь Святого Саввы', monastery: true },
	1008: { en: 'Old Church' },
	1010: { en: 'Bee Reserve' },
	1012: { ru: 'Озеро Ле', instanceOf: ['lake'], doubts: ['class'] },
	1004: { en: 'High Peak', instanceOf: ['Wikimedia disambiguation page', 'village'], doubts: ['disambiguation', 'settlement'] },
};

/** The double of Wikidata, recording the Q-ids it is asked for. */
function wikidata(asked: number[][] = []): PlacesSources['wikidata'] {
	return (qids) => {
		asked.push([...qids]);
		return Promise.resolve(
			new Map(
				qids.map((qid) => {
					const { ru, en, monastery = false, instanceOf = [], doubts = [] } = ITEMS[qid] ?? {};
					return [qid, { ru, en, point: undefined, monastery, instanceOf, doubts }];
				}),
			),
		);
	};
}

function build({
	sitelinks = PLACES_SITELINKS,
	asked = [],
	russianNames = new Map(),
	exclusions = new Map(),
}: {
	readonly sitelinks?: Readonly<Record<number, ItemSitelinks>>;
	readonly asked?: number[][];
	readonly russianNames?: ReadonlyMap<number, string>;
	readonly exclusions?: ReadonlyMap<number, PlaceDecision>;
} = {}) {
	return buildPlaces({
		osm: openOsm(fixturePath('places.osm')),
		sitelinks: ReadableStream.from(sitelinksDump(sitelinks)),
		wikidata: wikidata(asked),
		graph,
		cities: CITIES,
		russianNames,
		exclusions,
	});
}

/** The places of `fixtures/places.osm` with the sitelinks and the ruwiki titles of a dump's lines. */
async function sitelinksOf(dump: readonly string[]) {
	const { places } = await buildPlaces({
		osm: openOsm(fixturePath('places.osm')),
		sitelinks: ReadableStream.from(dump),
		wikidata: wikidata(),
		graph,
		cities: CITIES,
		russianNames: new Map(),
		exclusions: new Map(),
	});
	return places.map(({ qid, sitelinks, ru }) => [qid, sitelinks, ru]);
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

		await build({ asked });

		expect(asked.flat().toSorted((one, two) => one - two)).toEqual([1001, 1004, 1005, 1006, 1007, 1008, 1010, 1012]);
	});

	it('count the sitelinks of a dump of long INSERT lines as of a dump of a row a line', async () => {
		expect(await sitelinksOf(sitelinksDump(PLACES_SITELINKS, { lines: 'longLine', perStatement: 7 }))).toEqual(
			await sitelinksOf(sitelinksDump(PLACES_SITELINKS, { lines: 'rowALine', perStatement: 7 })),
		);
	});

	it('leave out an item of fewer than 10 sitelinks', async () => {
		const { places } = await build({ sitelinks: { ...PLACES_SITELINKS, 1004: { count: 9 } } });

		expect(places.map(({ qid }) => qid)).not.toContain(1004);
	});
});

describe('the places with an outline', () => {
	const outlinesGraph = fixtureGraph('place-outlines.osm');
	/** The sitelinks of the places of place-outlines.osm, every one famous. */
	const OUTLINE_SITELINKS = Object.fromEntries([2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009].map((qid) => [qid, { count: 20 }]));
	/** Wikidata's P625 of its places. */
	const POINTS: Readonly<Partial<Record<number, { lat: number; lon: number }>>> = {
		2001: { lat: 0.43, lon: 1 },
		2007: { lat: 0.97, lon: 1.08 },
	};

	const buildOutlines = () =>
		buildPlaces({
			osm: openOsm(fixturePath('place-outlines.osm')),
			sitelinks: ReadableStream.from(sitelinksDump(OUTLINE_SITELINKS)),
			wikidata: (qids) =>
				Promise.resolve(
					new Map(
						qids.map((qid) => [qid, { ru: undefined, en: undefined, point: POINTS[qid], monastery: false, instanceOf: [], doubts: [] }]),
					),
				),
			graph: outlinesGraph,
			cities: [{ lat: 0.8, lon: 0.3, population: 1_000_000 }],
			russianNames: new Map(),
			exclusions: new Map(),
		});

	it('are the closed ways and relations of a place’s tags, up to 2 000 km², not wholly within a city’s limits', async () => {
		const { places } = await buildOutlines();

		expect(places.map(({ qid, type }) => [qid, type]).toSorted(([one], [two]) => Number(one) - Number(two))).toEqual([
			[2001, 'lake'],
			[2002, 'lake'],
			[2004, 'lake'],
			[2006, 'castle'],
			[2007, 'mountain'],
		]);
	});

	it('are at Wikidata’s point, else at a point inside the outline', async () => {
		const places = byQid((await buildOutlines()).places);

		expect([2001, 2002, 2004, 2006, 2007].map((qid) => [qid, places.get(qid)?.lat, places.get(qid)?.lon])).toEqual([
			[2001, 0.43, 1],
			[2002, 0.205, 0.505],
			[2004, 0.25, 1.31],
			[2006, 0.8, 0.38],
			[2007, 0.97, 1.08],
		]);
	});

	it('get the roads inside the outline and within 1 km of its edge, one a cell of 5 km and country', async () => {
		const places = byQid((await buildOutlines()).places);

		expect(places.get(2001)?.access).toEqual([
			{ lat: 0.395, lon: 1.012, zone: 'BBB' },
			{ lat: 0.395, lon: 1.057, zone: 'BBB' },
			{ lat: 0.395, lon: 1.102, zone: 'BBB' },
			// The road's point nearest the cell's middle is 2.6 km from the lake: the road's nearest point to the
			// middle of those within 1 km of the lake.
			{ lat: 0.465, lon: 0.893, zone: 'AAA' },
			{ lat: 0.465, lon: 0.922, zone: 'AAA' },
			{ lat: 0.465, lon: 0.967, zone: 'AAA' },
			{ lat: 0.465, lon: 0.995, zone: 'AAA' },
		]);
		// Not at the middle of the island, a hole of the lake, but within 1 km of its shore.
		expect(places.get(2004)?.access).toEqual([
			{ lat: 0.202, lon: 1.36, zone: 'BBB' },
			{ lat: 0.229, lon: 1.36, zone: 'BBB' },
			{ lat: 0.292, lon: 1.36, zone: 'BBB' },
		]);
		// Within the city's limits, which the place itself is not; in the cell to the north, where the point nearest the
		// middle is 1.4 km off the corner, the nearest within 1 km of it.
		expect(places.get(2006)?.access).toEqual([
			{ lat: 0.787, lon: 0.355, zone: 'AAA' },
			{ lat: 0.827, lon: 0.355, zone: 'AAA' },
		]);
		expect(places.get(2007)?.access).toEqual([
			{ lat: 0.985, lon: 1.057, zone: 'BBB' },
			{ lat: 0.985, lon: 1.102, zone: 'BBB' },
		]);
	});

	it('get the access point of a place with a point when no road is within 1 km of the outline', async () => {
		const places = byQid((await buildOutlines()).places);

		expect(places.get(2002)?.access).toEqual([{ lat: 0.205, lon: 0.55, zone: 'AAA' }]);
	});

	it('are in the cells of 1° × 1° they touch with 1 km to spare, from 2 km across; a smaller one is a radius of 1 km and half its size', async () => {
		const { cells } = await buildOutlines();

		expect([...cells].map(([cell, { outlines, radii }]) => [cell, outlines.map(({ qid }) => qid), radii.map(({ qid }) => qid)])).toEqual([
			['0_0', [2001, 2006], [2002]],
			['0_1', [2001, 2004, 2007], []],
			['1_1', [2007], []],
		]);
		expect(cells.get('1_1')?.outlines).toEqual([{ qid: 2007, rings: [[0.95, 1.05, 0.95, 1.1, 0.995, 1.1, 0.995, 1.05]] }]);
		// The small lake is 0.01° across, 1.112 km: 1 km + 0.556 km around its point.
		expect(cells.get('0_0')?.radii).toEqual([{ qid: 2002, meters: 1556 }]);
	});

	it('are counted in the report: too large, broken, the cells', async () => {
		const { report } = await buildOutlines();

		expect(report).toMatchObject({
			objects: 9,
			belowSitelinks: 0,
			withoutOutline: 1,
			tooLarge: 1,
			inCities: 1,
			withoutAccess: 0,
			places: 5,
			cells: { count: 3, outlines: 4, radii: 1 },
		});
	});
});

describe('the table of exclusions of places', () => {
	/** Castle Hill's item is a village; Old Church is no doubt of Wikidata's, but out by hand; the lake is checked. */
	const TABLE = new Map<number, PlaceDecision>([
		[1005, 'out'],
		[1008, 'out'],
		[1012, 'keep'],
	]);

	it('leaves out of the file and the cells a place it puts out; a place it keeps and one it has no word on stay', async () => {
		const { places, cells } = await build({ exclusions: TABLE });

		expect([
			places.map(({ qid }) => qid),
			[...cells.values()].flatMap(({ radii }) => radii.map(({ qid }) => qid)).toSorted((one, two) => one - two),
		]).toEqual([
			[1001, 1010, 1006, 1012, 1004],
			[1001, 1004, 1006, 1010, 1012],
		]);
	});

	it('is counted in the report: the places it put out, and those Wikidata doubts it has no word on, by doubt, the most famous named', async () => {
		const { report } = await build({ exclusions: TABLE });

		expect([report.places, report.excluded, report.undecided]).toEqual([
			5,
			2,
			{
				count: 2,
				byDoubt: { class: 0, disambiguation: 1, settlement: 2 },
				mostFamous: [
					{ qid: 1001, name: 'Border Falls', type: 'waterfall', instanceOf: ['waterfall', 'municipality'], doubts: ['settlement'] },
					{
						qid: 1004,
						name: 'High Peak',
						type: 'mountain',
						instanceOf: ['Wikimedia disambiguation page', 'village'],
						doubts: ['disambiguation', 'settlement'],
					},
				],
			},
		]);
	});
});

describe('the build report of the table of exclusions', () => {
	it('counts the places it put out with the others left out, and names the most famous places in doubt it has no word on', async () => {
		const { report } = await build({ exclusions: new Map([[1005, 'out']]) });

		const markdown = placesMarkdown(report, 0, 600_000);

		expect(markdown).toContain('храмы, которые Wikidata не называет монастырём, — 1, убраны таблицей исключений — 1.');
		expect(markdown).toContain(
			'Кандидатов в исключения без решения в таблице `data/place-exclusions.tsv`: 3 (класс — 1, страница неоднозначности — 1, селение — 2). ' +
				'Самые известные: Border Falls (Q1001, waterfall, P31: waterfall, municipality), Jezero Le (Q1012, lake, P31: lake), ' +
				'High Peak (Q1004, mountain, P31: Wikimedia disambiguation page, village).',
		);
	});
});

describe('the world build', () => {
	it('keeps for the places the objects with the keys and values of every type’s tags, no more', () => {
		// The job `extract`'s `osmium tags-filter` of places: `nwr/<key>=<value>,<value>…` after its name.
		const workflow = readFileSync(join(import.meta.dirname, '../../.github/workflows/dataset.yml'), 'utf8');
		const command = /measure "tags-filter of places" osmium tags-filter (?<args>[^-]*?) -o/su.exec(workflow)?.groups?.args ?? '';
		const filtered = [...command.matchAll(/nwr\/(?<key>[\w:]+)=(?<values>[\w,]+)/gu)].flatMap(({ groups }) =>
			(groups?.values ?? '').split(',').map((value) => `${groups?.key}=${value}`),
		);

		expect(filtered.toSorted()).toEqual(placeFilterTags());
	});
});

describe('the report of the places', () => {
	it('counts what was left out and the places without a Russian name, the most famous of them named', async () => {
		const { report } = await build();

		expect(report).toEqual({
			objects: 12,
			belowSitelinks: 1,
			withoutOutline: 0,
			tooLarge: 0,
			inCities: 1,
			withoutAccess: 1,
			notMonasteries: 1,
			places: 7,
			excluded: 0,
			withoutRussian: { count: 1, mostFamous: [{ qid: 1008, name: 'Old Church' }] },
			// Every place Wikidata doubts, the table having no word on them.
			undecided: {
				count: 4,
				byDoubt: { class: 1, disambiguation: 1, settlement: 3 },
				mostFamous: [
					{ qid: 1001, name: 'Border Falls', type: 'waterfall', instanceOf: ['waterfall', 'municipality'], doubts: ['settlement'] },
					{ qid: 1012, name: 'Jezero Le', type: 'lake', instanceOf: ['lake'], doubts: ['class'] },
					{ qid: 1005, name: 'Castle Hill', type: 'castle', instanceOf: ['village', 'civil parish'], doubts: ['settlement'] },
					{
						qid: 1004,
						name: 'High Peak',
						type: 'mountain',
						instanceOf: ['Wikimedia disambiguation page', 'village'],
						doubts: ['disambiguation', 'settlement'],
					},
				],
			},
			// The places are points, each a radius of 1 km: 0.88°E in 0_0, 1.01°E and 1.13°E in 0_1. The files are
			// {"format":2,"outlines":[],"radii":[…]}, 37 bytes, and 11 a radius and a comma between two: 37 + 4 · 11 + 3
			// and 37 + 3 · 11 + 2.
			cells: { count: 2, outlines: 0, radii: 7, bytes: 156 },
		});
	});

	it('puts a place that is a point in the cells its radius of 1 km touches', async () => {
		const { cells } = await build();

		expect([...cells].map(([cell, { radii }]) => [cell, radii])).toEqual([
			['0_0', [1004, 1005, 1006, 1008].map((qid) => ({ qid, meters: 1000 }))],
			['0_1', [1001, 1010, 1012].map((qid) => ({ qid, meters: 1000 }))],
		]);
	});

	it('leaves out of the places without a Russian name those the table of Russian names has, which the deploy names', async () => {
		const { places, report } = await build({ russianNames: new Map([[1008, 'Старая церковь']]) });

		expect(report.withoutRussian).toEqual({ count: 0, mostFamous: [] });
		// The file keeps Wikidata's and ruwiki's names: the deploy puts the table over them.
		expect(byQid(places).get(1008)?.ru).toBe('');
	});
});
