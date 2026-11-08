// Sherpa's visa rules for one passport (spec «Визовые правила и сведение», #11, research/sherpa-api): the
// undocumented `POST /v3/maps`, which sorts ~230 countries into 7 groups. One request per citizenship; there is no
// fallback to `/v3/trips`. An answer counts only when it passes the schema below and lists at least 200 countries:
// anything else is a failure, and the copy in KV stays (visa-rules.ts).

export const SHERPA_MAPS_URL = 'https://requirements-api.joinsherpa.com/v3/maps';

/** The whole request, the answer's body included, or it is a `timeout`. */
export const SHERPA_TIMEOUT_MS = 10_000;

/** Fewer countries than this is a broken answer: a passport gets ~230. */
export const MIN_COUNTRIES = 200;

/** Sherpa's groups (`series[].type`), research/sherpa-api §2.2. */
export const SHERPA_CLASSES = [
	'NO_VISA_REQUIRED',
	'VISA_ON_ARRIVAL_REQUIRED',
	'EVISA_OR_ETA_REQUIRED',
	'PAPER_OR_EMBASSY_VISA_REQUIRED',
	'RESTRICTED_ENTRY',
	'UNKNOWN_ENTRY_RESTRICTION',
	'UNKNOWN_VISA_INFO',
] as const;

export type SherpaClass = (typeof SHERPA_CLASSES)[number];

/** One passport's table «country → class», as the countries of each class. A country in none is not listed. */
export type SherpaClasses = Readonly<Partial<Record<SherpaClass, readonly string[]>>>;

/**
 * What a request to Sherpa came to: the `result` of `sherpa fetched`, with the classes when it is `ok`, and what is
 * left of the quota when Sherpa's answer says it in a header (`QUOTA_HEADERS`; research/sherpa-api saw none).
 */
export type SherpaResult = (
	| { readonly result: 'ok'; readonly status: number; readonly classes: SherpaClasses }
	/** Sherpa answered another status, or no connection: `status` is absent. */
	| { readonly result: 'http_error'; readonly status?: number; readonly problem: string }
	| { readonly result: 'timeout'; readonly problem: string }
	| { readonly result: 'bad_response'; readonly status: number; readonly problem: string }
) & { readonly quotaRemaining?: number };

/** The headers that may say what is left of the quota, the usual one first, then the IETF draft's. */
export const QUOTA_HEADERS = ['x-ratelimit-remaining', 'ratelimit-remaining'] as const;

export type SherpaFailure = Exclude<SherpaResult, { result: 'ok' }>;

export interface SherpaDeps {
	/** The global fetch, or Sherpa's double. */
	readonly fetch: (request: Request) => Promise<Response>;
	/** The Worker's secret `SHERPA_API_KEY`. */
	readonly sherpaApiKey: string;
}

/**
 * A failure of Sherpa, for `logger.error`: errors group by this name. Why it failed goes in the context's `reason`,
 * with the citizenship and what the person was served (visa-rules.ts).
 */
export class SherpaError extends Error {
	override name = 'SherpaError';
}

/** `reason` of a `SherpaError`: the HTTP status, `network` for no connection, `timeout` or `bad_response`. */
export function failureReason(failure: SherpaFailure): string {
	if (failure.result === 'http_error') {
		return failure.status === undefined ? 'network' : String(failure.status);
	}
	return failure.result;
}

/** Sherpa's classes for `passport`, or why there are none. Never throws. */
export async function fetchSherpaClasses(passport: string, deps: SherpaDeps): Promise<SherpaResult> {
	const controller = new AbortController();
	// Set by the executor, which runs at once.
	let timer!: ReturnType<typeof setTimeout>;
	const timeout = new Promise<SherpaResult>((resolve) => {
		timer = setTimeout(() => {
			controller.abort();
			resolve({ result: 'timeout', problem: `no answer in ${SHERPA_TIMEOUT_MS / 1000} s` });
		}, SHERPA_TIMEOUT_MS);
	});
	try {
		return await Promise.race([request(passport, deps, controller.signal), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

async function request(passport: string, deps: SherpaDeps, signal: AbortSignal): Promise<SherpaResult> {
	let response: Response;
	let text: string;
	try {
		response = await deps.fetch(
			new Request(SHERPA_MAPS_URL, {
				method: 'POST',
				headers: { 'x-api-key': deps.sherpaApiKey, 'content-type': 'application/vnd.api+json' },
				body: JSON.stringify({ data: { type: 'MAP', attributes: { passportCode: passport } } }),
				signal,
			}),
		);
		text = await response.text();
	} catch (error) {
		return { result: 'http_error', problem: error instanceof Error ? error.message : String(error) };
	}
	const quota = quotaRemaining(response.headers);
	if (!response.ok) {
		return { result: 'http_error', status: response.status, problem: `Sherpa answered ${response.status}: ${text.slice(0, 200)}`, ...quota };
	}
	const classes = parseMap(text);
	return typeof classes === 'string'
		? { result: 'bad_response', status: response.status, problem: classes, ...quota }
		: { result: 'ok', status: response.status, classes, ...quota };
}

/** `{ quotaRemaining }` from the first of `QUOTA_HEADERS` that holds a whole number; nothing when none does. */
function quotaRemaining(headers: Headers): { quotaRemaining?: number } {
	for (const name of QUOTA_HEADERS) {
		const value = headers.get(name)?.trim();
		if (value !== undefined && /^\d+$/u.test(value)) {
			return { quotaRemaining: Number(value) };
		}
	}
	return {};
}

const CLASS_SET: ReadonlySet<string> = new Set(SHERPA_CLASSES);
const COUNTRY_CODE = /^[A-Z]{2,3}$/u;

/**
 * The classes of an answer, or what is wrong with it. The schema is what the reduction reads: `data.attributes
 * .series[]`, each with a known `type` and `data[]` of `{ id }`, a country code; at least 200 countries in all.
 * A country listed twice keeps its first class.
 */
function parseMap(text: string): SherpaClasses | string {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return 'the answer is not JSON';
	}
	const series = field(field(field(json, 'data'), 'attributes'), 'series');
	if (!Array.isArray(series)) {
		return 'no data.attributes.series';
	}
	const classes: Partial<Record<SherpaClass, string[]>> = {};
	const seen = new Set<string>();
	for (const group of series) {
		const type = field(group, 'type');
		const data = field(group, 'data');
		if (typeof type !== 'string' || !CLASS_SET.has(type) || !Array.isArray(data)) {
			return `a series of type ${JSON.stringify(type)}`;
		}
		const countries: string[] = (classes[type as SherpaClass] ??= []);
		for (const location of data) {
			const id = field(location, 'id');
			if (typeof id !== 'string' || !COUNTRY_CODE.test(id)) {
				return `a country ${JSON.stringify(id)} in ${type}`;
			}
			if (!seen.has(id)) {
				seen.add(id);
				countries.push(id);
			}
		}
	}
	return seen.size >= MIN_COUNTRIES ? classes : `${seen.size} countries, fewer than ${MIN_COUNTRIES}`;
}

function field(value: unknown, name: string): unknown {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}
