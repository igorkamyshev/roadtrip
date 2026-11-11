// Wikidata's Query Service (CC0), asked by ids, 400 a query: the Russian labels of cities by their GeoNames id, P1566
// (#6, «Обогащение из Wikidata»), for the cities GeoNames has no Russian name of; and the labels, point and class of
// places by their Q-id (ADR 0003). The Query Service lets a client one minute of processing a minute and answers 429
// past it (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual), so the queries go one after another and
// wait as long as it says.
import { field, isRecord, items } from 'engine/json';

const QUERY_SERVICE = 'https://query.wikidata.org/sparql';

/** Ids per query: 400 kept each query to a few seconds in #6's run. */
const BATCH = 400;
/** Tries per query before the build fails. */
const TRIES = 8;
/** The wait after a failure that says nothing of when to come back, doubled with each such failure. */
const BACKOFF_MS = 10_000;
/** The wait after a 429 without `Retry-After`. */
const RATE_LIMITED_MS = 60_000;
/** The service asks clients to say who they are. */
const USER_AGENT = 'roadtrip-data/0 (https://github.com/igorkamyshev/roadtrip; monthly dataset build)';

/** Wikidata's item of a monastery: a place of worship is a monastery only when it is one (ADR 0003). */
const MONASTERY = 'Q44613';

export interface WikidataDeps {
	readonly fetch: typeof fetch;
	readonly sleep: (ms: number) => Promise<void>;
	/** Where progress goes: a line per query. */
	readonly log?: (line: string) => void;
}

/** The Russian label of the item with each GeoNames id that has one; of several items with an id, the shortest. */
export async function wikidataRussianLabels(ids: readonly number[], deps: WikidataDeps): Promise<Map<number, string>> {
	const labels = new Map<number, string>();
	for (let start = 0; start < ids.length; start += BATCH) {
		const batch = ids.slice(start, start + BATCH);
		for (const binding of await query(russianLabelsOf(batch), deps)) {
			const { gn, l: label } = binding;
			if (gn === undefined || label === undefined) {
				throw new TypeError('Wikidata answered a row without ?gn and ?l');
			}
			const id = Number(gn);
			const current = labels.get(id);
			if (current === undefined || label.length < current.length) {
				labels.set(id, label);
			}
		}
		deps.log?.(`Wikidata: ${Math.min(start + BATCH, ids.length)} of ${ids.length} ids asked, ${labels.size} Russian labels`);
	}
	return labels;
}

function russianLabelsOf(ids: readonly number[]): string {
	return `SELECT ?gn ?l WHERE { VALUES ?gn { ${ids.map((id) => `"${id}"`).join(' ')} } ?item wdt:P1566 ?gn . ?item rdfs:label ?l FILTER(LANG(?l) = "ru") }`;
}

/** What a place's item says of it. */
export interface WikidataPlace {
	/** The Russian label. */
	readonly ru: string | undefined;
	/** The English label. */
	readonly en: string | undefined;
	/** P625, the first of several: the point of a place with an outline (#157). */
	readonly point: { readonly lat: number; readonly lon: number } | undefined;
	/** Whether it is an instance (P31) of Q44613, a monastery. */
	readonly monastery: boolean;
}

/** The items of the places by Q-id (a number: 1029310 for Q1029310); an item Wikidata lacks is not in the map. */
export async function wikidataPlaces(qids: readonly number[], deps: WikidataDeps): Promise<Map<number, WikidataPlace>> {
	const places = new Map<number, WikidataPlace>();
	for (let start = 0; start < qids.length; start += BATCH) {
		for (const binding of await query(placesOf(qids.slice(start, start + BATCH)), deps)) {
			const qid = Number(/\/Q(\d+)$/u.exec(binding.item ?? '')?.[1]);
			if (!Number.isInteger(qid)) {
				throw new TypeError(`Wikidata answered a row without ?item: ${JSON.stringify(binding)}`);
			}
			// Another row of the item: its next point.
			if (!places.has(qid)) {
				places.set(qid, { ru: binding.ru, en: binding.en, point: wktPoint(binding.point), monastery: binding.monastery === 'true' });
			}
		}
		deps.log?.(`Wikidata: ${Math.min(start + BATCH, qids.length)} of ${qids.length} places asked`);
	}
	return places;
}

function placesOf(qids: readonly number[]): string {
	return [
		'SELECT ?item ?ru ?en ?point ?monastery WHERE {',
		`VALUES ?item { ${qids.map((qid) => `wd:Q${qid}`).join(' ')} }`,
		'OPTIONAL { ?item rdfs:label ?ru FILTER(LANG(?ru) = "ru") }',
		'OPTIONAL { ?item rdfs:label ?en FILTER(LANG(?en) = "en") }',
		'OPTIONAL { ?item wdt:P625 ?point }',
		`BIND(EXISTS { ?item wdt:P31 wd:${MONASTERY} } AS ?monastery)`,
		'}',
	].join(' ');
}

/** A point of WKT, `Point(<lon> <lat>)`, in degrees; undefined for none or another shape. */
function wktPoint(wkt: string | undefined): WikidataPlace['point'] {
	const match = /^Point\(\s*(\S+)\s+(\S+)\s*\)$/u.exec(wkt ?? '');
	if (match === null) {
		return undefined;
	}
	const lon = Number(match[1]);
	const lat = Number(match[2]);
	return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : undefined;
}

/** A row of the answer: the value of each variable it binds. */
type Binding = Readonly<Partial<Record<string, string>>>;

/** A try of a query: the rows of its answer, or why it failed and how long the service asked to wait. */
type Attempt = { readonly bindings: Binding[] } | { readonly failure: string; readonly waitMs: number | undefined };

async function query(sparql: string, { fetch, sleep }: WikidataDeps): Promise<Binding[]> {
	let backoff = BACKOFF_MS;
	for (let tries = 1; ; tries++) {
		const attempt = await ask(sparql, fetch);
		if ('bindings' in attempt) {
			return attempt.bindings;
		}
		if (tries === TRIES) {
			throw new Error(`Wikidata: ${attempt.failure}, ${TRIES} tries`);
		}
		if (attempt.waitMs === undefined) {
			await sleep(backoff);
			backoff *= 2;
		} else {
			await sleep(attempt.waitMs);
		}
	}
}

async function ask(sparql: string, fetch: WikidataDeps['fetch']): Promise<Attempt> {
	try {
		const response = await fetch(QUERY_SERVICE, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				accept: 'application/sparql-results+json',
				'user-agent': USER_AGENT,
			},
			body: new URLSearchParams({ query: sparql }).toString(),
		});
		if (response.ok) {
			return { bindings: bindingsOf(await response.json()) };
		}
		return { failure: `HTTP ${response.status}`, waitMs: waitMs(response) };
	} catch (error) {
		return { failure: error instanceof Error ? error.message : String(error), waitMs: undefined };
	}
}

/** How long a failed answer asks to wait: its `Retry-After`, else a minute for a 429; undefined when it says nothing. */
function waitMs(response: Response): number | undefined {
	const retryAfter = Number(response.headers.get('retry-after') ?? Number.NaN);
	if (Number.isFinite(retryAfter)) {
		return retryAfter * 1000;
	}
	return response.status === 429 ? RATE_LIMITED_MS : undefined;
}

/** The rows of a SPARQL answer in JSON (`results.bindings`), each variable's value. */
function bindingsOf(json: unknown): Binding[] {
	return items(field(field(json, 'results'), 'bindings'), 'Wikidata’s results.bindings').map((binding) => {
		const values: Record<string, string> = {};
		for (const [name, term] of Object.entries(isRecord(binding) ? binding : {})) {
			const value = field(term, 'value');
			if (typeof value === 'string') {
				values[name] = value;
			}
		}
		return values;
	});
}
