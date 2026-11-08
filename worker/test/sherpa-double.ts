// Sherpa's double for the handler (src/sherpa.ts): a faked `fetch` that answers `/v3/maps` in Sherpa's shape of
// 2026-11-07 (research/sherpa-api, §3.3), as each test says.
import { COUNTRIES } from 'rules';
import { field } from '../src/json.ts';

/** Sherpa's groups in `/v3/maps` (research/sherpa-api, §2.2). */
export type SherpaGroup =
	| 'NO_VISA_REQUIRED'
	| 'VISA_ON_ARRIVAL_REQUIRED'
	| 'EVISA_OR_ETA_REQUIRED'
	| 'PAPER_OR_EMBASSY_VISA_REQUIRED'
	| 'RESTRICTED_ENTRY'
	| 'UNKNOWN_ENTRY_RESTRICTION'
	| 'UNKNOWN_VISA_INFO';

/** Every country Sherpa may list: ISO 3166-1, RKS and NX. */
export const SHERPA_COUNTRIES = Object.keys(COUNTRIES);

/**
 * The body of Sherpa's answer to `/v3/maps` for `passport`, shaped as on 2026-11-07 (research/sherpa-api, §3.3):
 * every country in `groups` where it says, the rest of `SHERPA_COUNTRIES` in `rest`, but for the passport's own
 * country and `absent`, which Sherpa leaves out.
 */
export function sherpaMap(
	passport: string,
	{
		groups = {},
		rest = 'NO_VISA_REQUIRED',
		absent = [],
	}: { groups?: Readonly<Record<string, SherpaGroup>>; rest?: SherpaGroup; absent?: readonly string[] } = {},
): object {
	const series = new Map<SherpaGroup, { id: string; type: 'LOCATION'; name: string }[]>();
	for (const country of SHERPA_COUNTRIES) {
		if (country === passport || absent.includes(country)) {
			continue;
		}
		const group = groups[country] ?? rest;
		series.set(group, [...(series.get(group) ?? []), { id: country, type: 'LOCATION', name: country }]);
	}
	return {
		meta: { copyright: 'Sherpa', version: '3.0.3' },
		data: {
			type: 'MAP',
			id: '0563bbcc-247d-445b-9a75-fcb85291e417',
			attributes: {
				passportCode: passport,
				series: [...series].map(([type, data]) => ({ type, label: type, title: type, total: data.length, data })),
				locationDetails: {},
			},
		},
	};
}

/**
 * How the double answers a passport: 201 with a body (`sherpaMap`'s, or any JSON or text) and the headers given,
 * another status, a dropped connection, or nothing until the request is aborted.
 */
type SherpaReply =
	| { readonly body: unknown; readonly headers?: Readonly<Record<string, string>> }
	| { readonly text: string }
	| { readonly status: number }
	| 'network error'
	| 'no answer';

/** Sherpa's `/v3/maps`: records each request, and answers it by `reply` once the test lets it. */
export class SherpaDouble {
	readonly requests: { readonly passport: string; readonly request: Request; readonly body: unknown }[] = [];
	#reply: (passport: string) => SherpaReply = (passport) => ({ body: sherpaMap(passport) });
	#held: Promise<void> | undefined;
	#release = () => {};

	/** How every next request is answered; by default every passport gets every country visa-free. */
	answer(reply: (passport: string) => SherpaReply): void {
		this.#reply = reply;
	}

	/** Holds every next answer until `release`. */
	hold(): void {
		this.#held = new Promise((resolve) => {
			this.#release = resolve;
		});
	}

	release(): void {
		this.#release();
		this.#held = undefined;
	}

	/** The passports asked for, in order. */
	get passports(): string[] {
		return this.requests.map((request) => request.passport);
	}

	readonly fetch = async (request: Request): Promise<Response> => {
		const body: unknown = await request.clone().json();
		const passportCode = field(field(field(body, 'data'), 'attributes'), 'passportCode');
		const passport = typeof passportCode === 'string' ? passportCode : '';
		this.requests.push({ passport, request, body });
		const reply = this.#reply(passport);
		await this.#held;
		if (reply === 'network error') {
			throw new TypeError('fetch failed');
		}
		if (reply === 'no answer') {
			return new Promise((_, reject) => {
				request.signal.addEventListener('abort', () => {
					// As fetch does: with the abort's reason, a DOMException (an Error) when abort() was given none.
					const reason: unknown = request.signal.reason;
					reject(reason instanceof Error ? reason : new Error('The request was aborted'));
				});
			});
		}
		if ('status' in reply) {
			return Response.json({ errors: [{ status: String(reply.status) }] }, { status: reply.status });
		}
		return 'text' in reply ? new Response(reply.text, { status: 201 }) : Response.json(reply.body, { status: 201, headers: reply.headers });
	};
}
