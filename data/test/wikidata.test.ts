// Wikidata's Russian labels of cities by their GeoNames id (P1566), for the cities file (#6, «Обогащение из
// Wikidata»): the Query Service is doubled by a fetch that answers in its JSON and records each query.
import { describe, expect, it } from 'vitest';
import { wikidataRussianLabels } from '../src/wikidata.ts';

interface Query {
	readonly url: string;
	readonly ids: number[];
	readonly userAgent: string | null;
}

/** The query service: labels by GeoNames id (several items may share an id), or a status to answer with. */
function queryService(labels: Record<number, string[]>, failures: { status: number; retryAfter?: string }[] = []) {
	const queries: Query[] = [];
	const fetch = async (input: string | URL | Request, init?: RequestInit) => {
		const body = new URLSearchParams(String(init?.body));
		const sparql = body.get('query') ?? '';
		const ids = [...sparql.matchAll(/"(\d+)"/gu)].map((match) => Number(match[1]));
		queries.push({ url: String(input), ids, userAgent: new Headers(init?.headers).get('user-agent') });
		const failure = failures.shift();
		if (failure !== undefined) {
			return new Response('busy', { status: failure.status, headers: failure.retryAfter === undefined ? {} : { 'retry-after': failure.retryAfter } });
		}
		const bindings = ids.flatMap((id) => (labels[id] ?? []).map((label) => ({ gn: { type: 'literal', value: String(id) }, l: { type: 'literal', 'xml:lang': 'ru', value: label } })));
		return Response.json({ head: { vars: ['gn', 'l'] }, results: { bindings } });
	};
	return { fetch, queries };
}

function clock() {
	const waits: number[] = [];
	return {
		waits,
		sleep: async (ms: number) => {
			waits.push(ms);
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
		const service = queryService({}, Array.from({ length: 10 }, () => ({ status: 500 })));

		await expect(wikidataRussianLabels([1], { fetch: service.fetch, sleep: clock().sleep })).rejects.toThrow('Wikidata: HTTP 500');
	});

	it('ask nothing for no ids', async () => {
		const service = queryService({});

		expect(await wikidataRussianLabels([], { fetch: service.fetch, sleep: clock().sleep })).toEqual(new Map());
		expect(service.queries).toEqual([]);
	});
});
