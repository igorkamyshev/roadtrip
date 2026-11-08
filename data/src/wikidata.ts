// Wikidata's Russian labels of cities by their GeoNames id, P1566 (#6, «Обогащение из Wikidata»): for the cities
// GeoNames has no Russian name of. Wikidata is CC0. The Query Service lets a client one minute of processing a
// minute and answers 429 past it (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual), so the
// queries go one after another and wait as long as it says.
import { field, items } from 'engine/json';

const QUERY_SERVICE = 'https://query.wikidata.org/sparql';

/** GeoNames ids per query: 400 kept each query to a few seconds in #6's run. */
const BATCH = 400;
/** Tries per query before the build fails. */
const TRIES = 8;
/** The wait after a failure that says nothing of when to come back, doubled with each such failure. */
const BACKOFF_MS = 10_000;
/** The wait after a 429 without `Retry-After`. */
const RATE_LIMITED_MS = 60_000;
/** The service asks clients to say who they are. */
const USER_AGENT = 'roadtrip-data/0 (https://github.com/igorkamyshev/roadtrip; monthly dataset build)';

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
		for (const { geonamesId, label } of await query(russianLabelsOf(batch), deps)) {
			const id = Number(geonamesId);
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

/** A row of the answer: the GeoNames id (?gn) and the Russian label (?l). */
interface Binding {
	readonly geonamesId: string;
	readonly label: string;
}

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

/** The rows of a SPARQL answer in JSON (`results.bindings`), each with its ?gn and ?l. */
function bindingsOf(json: unknown): Binding[] {
	return items(field(field(json, 'results'), 'bindings'), 'Wikidata’s results.bindings').map((binding) => {
		const geonamesId = field(field(binding, 'gn'), 'value');
		const label = field(field(binding, 'l'), 'value');
		if (typeof geonamesId !== 'string' || typeof label !== 'string') {
			throw new TypeError('Wikidata answered a row without ?gn and ?l');
		}
		return { geonamesId, label };
	});
}
