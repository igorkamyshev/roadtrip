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
}

/** A literal of a SPARQL answer in JSON. */
const literal = (value: string, language?: string) => ({
	type: 'literal',
	value,
	...(language === undefined ? {} : { 'xml:lang': language }),
});

/** The rows of the answer for an item: one, or one per point, as SPARQL's OPTIONAL gives them. */
function itemRows(qid: number, { ru, en, points = [], monastery = false }: Item): Record<string, unknown>[] {
	const row: Record<string, unknown> = {
		item: { type: 'uri', value: `http://www.wikidata.org/entity/Q${qid}` },
		monastery: { type: 'literal', datatype: 'http://www.w3.org/2001/XMLSchema#boolean', value: String(monastery) },
	};
	if (ru !== undefined) {
		row.ru = literal(ru, 'ru');
	}
	if (en !== undefined) {
		row.en = literal(en, 'en');
	}
	return points.length === 0 ? [row] : points.map((point) => Object.assign({}, row, { point: literal(point) }));
}

/** The query service for the places: items by Q-id, each asked for answered with its rows. */
function placesService(known: Record<number, Item>) {
	const queries: number[][] = [];
	const fetch = (_: string | URL | Request, init?: RequestInit) => {
		const sparql = new URLSearchParams(typeof init?.body === 'string' ? init.body : '').get('query') ?? '';
		const qids = [...sparql.matchAll(/wd:Q(\d+)/gu)].map((match) => Number(match[1])).filter((qid) => qid !== 44_613);
		queries.push(qids);
		const bindings = qids.flatMap((qid) => itemRows(qid, known[qid] ?? {}));
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
		expect(items.get(1)).toEqual({ ru: 'Бледское озеро', en: 'Lake Bled', point: { lat: 46.363, lon: 14.094 }, monastery: false });
		expect(items.get(2)).toEqual({ ru: undefined, en: 'Manasija', point: undefined, monastery: true });
		expect(items.get(401)).toEqual({ ru: undefined, en: undefined, point: undefined, monastery: false });
	});

	it('take the first point of an item with several', async () => {
		const service = placesService({ 7: { points: ['Point(20.5 44.8)', 'Point(20.6 44.9)'] } });

		const items = await wikidataPlaces([7], { fetch: service.fetch, sleep: clock().sleep });

		expect(items.get(7)?.point).toEqual({ lat: 44.8, lon: 20.5 });
	});
});
