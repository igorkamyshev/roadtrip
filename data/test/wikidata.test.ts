// Wikidata's Russian labels of cities by their GeoNames id (P1566), for the cities file (#6, «Обогащение из
// Wikidata»): the Query Service is doubled by a fetch that answers in its JSON and records each query.
import { describe, expect, it } from 'vitest';
import { wikidataPlaces, wikidataRussianLabels } from '../src/wikidata.ts';

interface Query {
	readonly url: string;
	readonly ids: number[];
	readonly userAgent: string | null;
}

/** The query service: labels by GeoNames id (several items may share an id), or a status to answer with. */
function queryService(labels: Record<number, string[]>, failures: { status: number; retryAfter?: string }[] = []) {
	const queries: Query[] = [];
	const answer = (input: string | URL | Request, init?: RequestInit) => {
		// The client posts the query as a form, in a string.
		const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
		const sparql = body.get('query') ?? '';
		const ids = [...sparql.matchAll(/"(\d+)"/gu)].map((match) => Number(match[1]));
		queries.push({
			url: input instanceof Request ? input.url : input.toString(),
			ids,
			userAgent: new Headers(init?.headers).get('user-agent'),
		});
		const failure = failures.shift();
		if (failure !== undefined) {
			return new Response('busy', {
				status: failure.status,
				headers: failure.retryAfter === undefined ? {} : { 'retry-after': failure.retryAfter },
			});
		}
		const bindings = ids.flatMap((id) =>
			(labels[id] ?? []).map((label) => ({
				gn: { type: 'literal', value: String(id) },
				l: { type: 'literal', 'xml:lang': 'ru', value: label },
			})),
		);
		return Response.json({ head: { vars: ['gn', 'l'] }, results: { bindings } });
	};
	const fetch = (input: string | URL | Request, init?: RequestInit) => Promise.resolve(answer(input, init));
	return { fetch, queries };
}

function clock() {
	const waits: number[] = [];
	return {
		waits,
		sleep: (ms: number) => {
			waits.push(ms);
			return Promise.resolve();
		},
	};
}

describe("Wikidata's Russian labels", () => {
	it('are asked of the query service by GeoNames id, 400 at a time, one query after another', async () => {
		const ids = Array.from({ length: 900 }, (_, index) => index + 1);
		const service = queryService({ 1: ['Алст'], 450: ['Хобокен'], 900: ['Ла-Калера'] });
		const { sleep } = clock();

		const labels = await wikidataRussianLabels(ids, { fetch: service.fetch, sleep });

		expect(service.queries.map((query) => query.ids.length)).toEqual([400, 400, 100]);
		expect(service.queries.flatMap((query) => query.ids)).toEqual(ids);
		expect(service.queries[0].url).toBe('https://query.wikidata.org/sparql');
		expect(service.queries[0].userAgent).toMatch(/^roadtrip/u);
		expect(labels).toEqual(
			new Map([
				[1, 'Алст'],
				[450, 'Хобокен'],
				[900, 'Ла-Калера'],
			]),
		);
	});

	it('take the shortest label where several items have the same GeoNames id', async () => {
		const service = queryService({ 7: ['Вилья-Долорес (город)', 'Вилья-Долорес'] });

		expect(await wikidataRussianLabels([7], { fetch: service.fetch, sleep: clock().sleep })).toEqual(new Map([[7, 'Вилья-Долорес']]));
	});

	it('wait as long as a 429 says and ask again, and back off after another failure', async () => {
		const service = queryService({ 1: ['Алст'] }, [{ status: 429, retryAfter: '30' }, { status: 504 }]);
		const { sleep, waits } = clock();

		const labels = await wikidataRussianLabels([1], { fetch: service.fetch, sleep });

		expect(labels).toEqual(new Map([[1, 'Алст']]));
		expect(service.queries).toHaveLength(3);
		expect(waits).toEqual([30_000, 10_000]);
	});

	it('fail the build when the query service keeps failing', async () => {
		const service = queryService(
			{},
			Array.from({ length: 10 }, () => ({ status: 500 })),
		);

		await expect(wikidataRussianLabels([1], { fetch: service.fetch, sleep: clock().sleep })).rejects.toThrow('Wikidata: HTTP 500');
	});

	it('ask nothing for no ids', async () => {
		const service = queryService({});

		expect(await wikidataRussianLabels([], { fetch: service.fetch, sleep: clock().sleep })).toEqual(new Map());
		expect(service.queries).toEqual([]);
	});
});

/** What the query service knows of an item, for the places. */
interface Item {
	readonly ru?: string;
	readonly en?: string;
	/** P625, as WKT: `Point(<lon> <lat>)`; several values make several rows. */
	readonly points?: readonly string[];
	/** Whether it is an instance of Q44613, a monastery. */
	readonly monastery?: boolean;
	/** Its classes (P31): each its Q-id and English label, if it has one; several make several rows. */
	readonly instanceOf?: readonly (readonly [qid: number, label?: string])[];
	/** Whether it has P279, a class itself. */
	readonly subclass?: boolean;
	/** Whether it is an instance of Q4167410, a disambiguation page. */
	readonly disambiguation?: boolean;
	/** Whether a class of it (P31, then P279 up to any depth) is Q486972 or Q56061, a settlement or an administrative unit. */
	readonly settlement?: boolean;
}

/** A literal of a SPARQL answer in JSON. */
const literal = (value: string, language?: string) => ({
	type: 'literal',
	value,
	...(language === undefined ? {} : { 'xml:lang': language }),
});

/** A boolean of a SPARQL answer in JSON. */
const boolean = (value: boolean) => ({ type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#boolean', value: String(value) });

/** An item's URI, as the answer binds it. */
const entity = (qid: number) => ({ type: 'uri', value: `http://www.wikidata.org/entity/Q${qid}` });

/** The rows of the answer for an item: one, or one per point and class, as SPARQL's OPTIONAL gives them. */
function itemRows(
	qid: number,
	{ ru, en, points = [], monastery = false, instanceOf = [], subclass = false, disambiguation = false, settlement = false }: Item,
): Record<string, unknown>[] {
	const row: Record<string, unknown> = {
		item: entity(qid),
		monastery: boolean(monastery),
		subclass: boolean(subclass),
		disambiguation: boolean(disambiguation),
		settlement: boolean(settlement),
	};
	if (ru !== undefined) {
		row.ru = literal(ru, 'ru');
	}
	if (en !== undefined) {
		row.en = literal(en, 'en');
	}
	const withPoints = points.length === 0 ? [row] : points.map((point) => ({ ...row, point: literal(point) }));
	return instanceOf.length === 0
		? withPoints
		: withPoints.flatMap((pointRow) =>
				instanceOf.map(([classQid, label]) => ({
					...pointRow,
					class: entity(classQid),
					...(label === undefined ? {} : { classLabel: literal(label, 'en') }),
				})),
			);
}

/** The items the query names by their own Q-ids, not those of the classes it asks of (Q44613, Q4167410, Q486972, Q56061). */
const ASKED_OF = new Set([44_613, 4_167_410, 486_972, 56_061]);

/**
 * How the query binds each doubt of an item, as the service would read it: a doubt the query does not bind so is
 * never true in the answer, so a query that asks P31 for P279 or another class of settlements finds no doubt.
 */
const DOUBT_CLAUSES = {
	subclass: /BIND\(EXISTS \{ \?item wdt:P279 \[\] \} AS \?subclass\)/u,
	disambiguation: /BIND\(EXISTS \{ \?item wdt:P31 wd:Q4167410 \} AS \?disambiguation\)/u,
	settlement:
		/BIND\(EXISTS \{ \?item wdt:P31\/wdt:P279\* wd:Q486972 \} \|\| EXISTS \{ \?item wdt:P31\/wdt:P279\* wd:Q56061 \} AS \?settlement\)/u,
} as const;

/** The query service for the places: items by Q-id, each asked for answered with its rows. */
function placesService(known: Record<number, Item>) {
	const queries: number[][] = [];
	const fetch = (_: string | URL | Request, init?: RequestInit) => {
		const sparql = new URLSearchParams(typeof init?.body === 'string' ? init.body : '').get('query') ?? '';
		const qids = [...sparql.matchAll(/wd:Q(\d+)/gu)].map((match) => Number(match[1])).filter((qid) => !ASKED_OF.has(qid));
		queries.push(qids);
		const asked = (doubt: keyof typeof DOUBT_CLAUSES) => DOUBT_CLAUSES[doubt].test(sparql);
		const bindings = qids.flatMap((qid) => {
			const item = known[qid] ?? {};
			return itemRows(qid, {
				...item,
				subclass: asked('subclass') && item.subclass === true,
				disambiguation: asked('disambiguation') && item.disambiguation === true,
				settlement: asked('settlement') && item.settlement === true,
			});
		});
		return Promise.resolve(Response.json({ results: { bindings } }));
	};
	return { fetch, queries };
}

describe("Wikidata's items of the places", () => {
	it('are asked by Q-id, 400 at a time: the Russian and English labels, the point and whether it is a monastery', async () => {
		const qids = Array.from({ length: 401 }, (_, index) => index + 1);
		const service = placesService({
			1: { ru: 'Бледское озеро', en: 'Lake Bled', points: ['Point(14.094 46.363)'] },
			2: { en: 'Manasija', monastery: true },
			401: {},
		});

		const items = await wikidataPlaces(qids, { fetch: service.fetch, sleep: clock().sleep });

		expect(service.queries.map((query) => query.length)).toEqual([400, 1]);
		expect([items.get(1), items.get(2), items.get(401)]).toEqual([
			{ ru: 'Бледское озеро', en: 'Lake Bled', point: { lat: 46.363, lon: 14.094 }, monastery: false, instanceOf: [], doubts: [] },
			{ ru: undefined, en: 'Manasija', point: undefined, monastery: true, instanceOf: [], doubts: [] },
			{ ru: undefined, en: undefined, point: undefined, monastery: false, instanceOf: [], doubts: [] },
		]);
	});

	it('are in doubt as a class (P279), a disambiguation page (Q4167410) or a settlement (P31 to Q486972 or Q56061), with the labels of their classes', async () => {
		const service = placesService({
			// Lime kiln, a class.
			59_772: { en: 'lime kiln', subclass: true, instanceOf: [[16_889_133, 'class']] },
			// Wayne, a page of several.
			2_625_806: { en: 'Wayne', disambiguation: true, instanceOf: [[4_167_410, 'Wikimedia disambiguation page']] },
			// Calstock, a village and a civil parish.
			744_317: {
				en: 'Calstock',
				settlement: true,
				points: ['Point(-4.21 50.497)', 'Point(-4.2 50.5)'],
				instanceOf: [
					[532, 'village'],
					[1_115_575, 'civil parish'],
				],
			},
			// Petra: an archaeological site, and a city of old, which a settlement's class holds too.
			5788: { en: 'Petra', settlement: true, instanceOf: [[839_954, 'archaeological site'], [15_661_340]] },
			// Lake Bled, a lake.
			1_029_310: { en: 'Lake Bled', instanceOf: [[23_397, 'lake']] },
		});

		const items = await wikidataPlaces([59_772, 2_625_806, 744_317, 5788, 1_029_310], { fetch: service.fetch, sleep: clock().sleep });

		expect([...items].map(([qid, { instanceOf, doubts }]) => [qid, instanceOf, doubts])).toEqual([
			[59_772, ['class'], ['class']],
			[2_625_806, ['Wikimedia disambiguation page'], ['disambiguation']],
			[744_317, ['village', 'civil parish'], ['settlement']],
			// A class without an English label is its Q-id.
			[5788, ['archaeological site', 'Q15661340'], ['settlement']],
			[1_029_310, ['lake'], []],
		]);
	});

	it('take the first point of an item with several', async () => {
		const service = placesService({ 7: { points: ['Point(20.5 44.8)', 'Point(20.6 44.9)'] } });

		const items = await wikidataPlaces([7], { fetch: service.fetch, sleep: clock().sleep });

		expect(items.get(7)?.point).toEqual({ lat: 44.8, lon: 20.5 });
	});
});
