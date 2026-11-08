// Wikidata's Russian labels of cities by their GeoNames id, P1566 (#6, «Обогащение из Wikidata»): for the cities
// GeoNames has no Russian name of. Wikidata is CC0. The Query Service lets a client one minute of processing a
// minute and answers 429 past it (https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual), so the
// queries go one after another and wait as long as it says.

export const QUERY_SERVICE = 'https://query.wikidata.org/sparql';

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
		for (const { gn, l } of await query(russianLabelsOf(batch), deps)) {
			const id = Number(gn.value);
			const current = labels.get(id);
			if (current === undefined || l.value.length < current.length) {
				labels.set(id, l.value);
			}
		}
		deps.log?.(`Wikidata: ${Math.min(start + BATCH, ids.length)} of ${ids.length} ids asked, ${labels.size} Russian labels`);
	}
	return labels;
}

function russianLabelsOf(ids: readonly number[]): string {
	return `SELECT ?gn ?l WHERE { VALUES ?gn { ${ids.map((id) => `"${id}"`).join(' ')} } ?item wdt:P1566 ?gn . ?item rdfs:label ?l FILTER(LANG(?l) = "ru") }`;
}

interface Binding {
	readonly gn: { readonly value: string };
	readonly l: { readonly value: string };
}

async function query(sparql: string, { fetch, sleep }: WikidataDeps): Promise<Binding[]> {
	let backoff = BACKOFF_MS;
	for (let tries = 1; ; tries++) {
		let failure: string;
		let told: number | undefined;
		try {
			const response = await fetch(QUERY_SERVICE, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/sparql-results+json', 'user-agent': USER_AGENT },
				body: new URLSearchParams({ query: sparql }).toString(),
			});
			if (response.ok) {
				return ((await response.json()) as { results: { bindings: Binding[] } }).results.bindings;
			}
			failure = `HTTP ${response.status}`;
			const retryAfter = Number(response.headers.get('retry-after') ?? Number.NaN);
			told = Number.isFinite(retryAfter) ? retryAfter * 1000 : response.status === 429 ? RATE_LIMITED_MS : undefined;
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		}
		if (tries === TRIES) {
			throw new Error(`Wikidata: ${failure}, ${TRIES} tries`);
		}
		if (told === undefined) {
			await sleep(backoff);
			backoff *= 2;
		} else {
			await sleep(told);
		}
	}
}
