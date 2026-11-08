// The visa rules in the ring API (spec «Визовые правила и сведение», «API кольца», «Решения по тестам», seam 2; #11):
// Sherpa's classes per citizenship, reduced to an entry mode per country, whose closed countries the calculation
// avoids; Sherpa's copies in KV. Sherpa is a faked `fetch` (test/api.ts) answering in the shape of 2026-11-07.
import { fixtureGraph } from 'data/fixture-graph';
import { describe, expect, it } from 'vitest';
import {
	api,
	DAY,
	engineContainer,
	HOUR,
	MINUTE,
	recorded,
	SHERPA_API_KEY,
	SHERPA_COUNTRIES,
	SherpaDouble,
	sherpaMap,
	START,
} from '../test/api.ts';

const straightRoad = fixtureGraph('straight-road.osm');

/** The countries closed for everyone (rules' border table), closed in every set. */
const CLOSED_FOR_EVERYONE = ['AZE', 'BTN', 'CHN', 'MMR', 'RKS', 'UKR'];

describe('the visa rules', () => {
	it('give each country Sherpa lists its entry mode, and close those it does not', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => ({
			body: sherpaMap(passport, {
				groups: {
					KHM: 'VISA_ON_ARRIVAL_REQUIRED',
					ALB: 'EVISA_OR_ETA_REQUIRED',
					HRV: 'PAPER_OR_EMBASSY_VISA_REQUIRED',
					LBN: 'RESTRICTED_ENTRY',
					AFG: 'UNKNOWN_ENTRY_RESTRICTION',
					KIR: 'UNKNOWN_VISA_INFO',
				},
				absent: ['SYR', 'YEM'],
			}),
		}));
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa });

		const { status, body } = await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(status).toBe(200);
		expect(body.access).toMatchObject({
			GEO: { mode: 'visa_free', citizenship: 'RUS' },
			KHM: { mode: 'visa_on_arrival', citizenship: 'RUS' },
			ALB: { mode: 'evisa', citizenship: 'RUS' },
		});
		for (const closed of ['HRV', 'LBN', 'AFG', 'KIR', 'SYR', 'YEM']) {
			expect((body.access as Record<string, unknown>)[closed]).toEqual({ mode: 'closed' });
		}
		expect(container.bodies).toEqual([
			expect.objectContaining({ closedCountries: ['AFG', 'AZE', 'BTN', 'CHN', 'HRV', 'KIR', 'LBN', 'MMR', 'RKS', 'SYR', 'UKR', 'YEM'] }),
		]);
	});

	it('give each country the best mode among the citizenships, and the citizenship it comes from', async () => {
		const sherpa = new SherpaDouble();
		const russian = {
			GEO: 'EVISA_OR_ETA_REQUIRED',
			KHM: 'EVISA_OR_ETA_REQUIRED',
			THA: 'NO_VISA_REQUIRED',
			HRV: 'PAPER_OR_EMBASSY_VISA_REQUIRED',
		} as const;
		const serbian = {
			GEO: 'NO_VISA_REQUIRED',
			KHM: 'VISA_ON_ARRIVAL_REQUIRED',
			THA: 'NO_VISA_REQUIRED',
			HRV: 'PAPER_OR_EMBASSY_VISA_REQUIRED',
		} as const;
		sherpa.answer((passport) => ({
			body: sherpaMap(passport, { groups: passport === 'RUS' ? russian : serbian, rest: 'UNKNOWN_VISA_INFO' }),
		}));
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS,SRB');

		expect(sherpa.passports.sort()).toEqual(['RUS', 'SRB']);
		expect(body.access).toMatchObject({
			GEO: { mode: 'visa_free', citizenship: 'SRB' },
			KHM: { mode: 'visa_on_arrival', citizenship: 'SRB' },
			// The same mode by both: the first citizenship.
			THA: { mode: 'visa_free', citizenship: 'RUS' },
			HRV: { mode: 'closed' },
			USA: { mode: 'closed' },
		});
		const { closedCountries } = container.bodies[0] as { closedCountries: string[] };
		expect(closedCountries).toContain('HRV');
		expect(closedCountries).not.toContain('GEO');
		expect(closedCountries).not.toContain('KHM');
	});

	it("open the country of every citizenship, which Sherpa leaves out of the passport's own answer", async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => ({ body: sherpaMap(passport, { rest: 'PAPER_OR_EMBASSY_VISA_REQUIRED' }) }));
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS,SRB');

		expect(body.access).toMatchObject({
			RUS: { mode: 'visa_free', citizenship: 'RUS' },
			SRB: { mode: 'visa_free', citizenship: 'SRB' },
			BIH: { mode: 'closed' },
		});
		const { closedCountries } = container.bodies[0] as { closedCountries: string[] };
		expect(closedCountries).toHaveLength(251 - 2);
		expect(closedCountries).not.toContain('RUS');
		expect(closedCountries).not.toContain('SRB');
	});

	it('keep the countries and territories closed for everyone closed, whatever Sherpa says and the citizenship is', async () => {
		const sherpa = new SherpaDouble();
		// Sherpa lets Ukrainians into Azerbaijan and China without a visa.
		sherpa.answer((passport) => ({ body: sherpaMap(passport, { groups: { AZE: 'NO_VISA_REQUIRED', CHN: 'NO_VISA_REQUIRED' } }) }));
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa });

		const { body } = await get('lat=0&lon=0&hours=2&cit=UKR');

		const closedForEveryone = { mode: 'closed', closedForEveryone: true };
		expect(body.access).toMatchObject({
			UKR: closedForEveryone,
			AZE: closedForEveryone,
			CHN: closedForEveryone,
			RKS: closedForEveryone,
			BTN: closedForEveryone,
			MMR: closedForEveryone,
			CRIMEA: closedForEveryone,
			ABKHAZIA: closedForEveryone,
			SOUTH_OSSETIA: closedForEveryone,
			GAZA: closedForEveryone,
			WESTERN_SAHARA: closedForEveryone,
			POL: { mode: 'visa_free', citizenship: 'UKR' },
		});
		expect(container.bodies).toEqual([expect.objectContaining({ closedCountries: CLOSED_FOR_EVERYONE })]);
	});
});

describe('Sherpa', () => {
	it('gets POST /v3/maps per citizenship with the key', async () => {
		const sherpa = new SherpaDouble();
		const { get } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=2&cit=RUS,SRB');

		expect(
			sherpa.requests
				.map(({ request, body }) => ({
					method: request.method,
					url: request.url,
					key: request.headers.get('x-api-key'),
					type: request.headers.get('content-type'),
					body,
				}))
				.sort((one, two) => JSON.stringify(one.body).localeCompare(JSON.stringify(two.body))),
		).toEqual(
			['RUS', 'SRB'].map((passport) => ({
				method: 'POST',
				url: 'https://requirements-api.joinsherpa.com/v3/maps',
				key: SHERPA_API_KEY,
				type: 'application/vnd.api+json',
				body: { data: { type: 'MAP', attributes: { passportCode: passport } } },
			})),
		);
	});
});

describe("Sherpa's copies", () => {
	it('are fresh for a day: Sherpa is asked once', async () => {
		const { get, clock, sherpa } = api({ container: await engineContainer(straightRoad) });

		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + DAY - 1;
		const { body } = await get('lat=0&lon=0&hours=3&cit=RUS');

		expect(sherpa.passports).toEqual(['RUS']);
		expect(body.visaRulesLoadedAt).toBe('2026-11-07T00:00:00.000Z');
	});

	it('once stale are served at once, and refreshed in the background for the next request', async () => {
		const { request, settle, get, clock, sherpa } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer((passport) => ({ body: sherpaMap(passport, { groups: { GEO: 'EVISA_OR_ETA_REQUIRED' } }) }));
		sherpa.hold();

		clock.now = START + DAY;
		const stale = await request('lat=0&lon=0&hours=2&cit=RUS');

		expect(stale.body).toMatchObject({ visaRulesLoadedAt: '2026-11-07T00:00:00.000Z', access: { GEO: { mode: 'visa_free' } } });
		expect(sherpa.passports).toEqual(['RUS', 'RUS']);
		sherpa.release();
		await settle();
		clock.now = START + DAY + HOUR;
		const refreshed = await get('lat=0&lon=0&hours=2&cit=RUS');
		expect(refreshed.body).toMatchObject({ visaRulesLoadedAt: '2026-11-08T00:00:00.000Z', access: { GEO: { mode: 'evisa' } } });
		expect(sherpa.passports).toEqual(['RUS', 'RUS']);
	});

	it('once stale are refreshed by one request at a time, however many come while it runs', async () => {
		const { request, settle, get, clock, sherpa } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.hold();

		clock.now = START + DAY;
		await Promise.all([
			request('lat=0&lon=0&hours=2&cit=RUS'),
			request('lat=0&lon=0&hours=3&cit=RUS'),
			request('lat=0&lon=0&hours=4&cit=RUS'),
		]);
		expect(sherpa.passports).toEqual(['RUS', 'RUS']);
		sherpa.release();
		await settle();

		// Once a refresh ended, the next stale copy is refreshed again: after one that came, and after one that failed,
		// once the 15 min of the failure are over.
		clock.now = START + 2 * DAY;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer(() => ({ status: 503 }));
		clock.now = START + 3 * DAY;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + 3 * DAY + 15 * MINUTE;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		expect(sherpa.passports).toEqual(['RUS', 'RUS', 'RUS', 'RUS', 'RUS']);
	});

	it('are waited for when there is none', async () => {
		const { request, sherpa } = api({ container: await engineContainer(straightRoad) });
		sherpa.hold();

		let answered = false;
		const answer = request('lat=0&lon=0&hours=2&cit=RUS').then((result) => {
			answered = true;
			return result;
		});
		await expect.poll(() => sherpa.requests.length).toBe(1);
		await Promise.resolve();
		expect(answered).toBe(false);
		sherpa.release();

		expect(await answer).toMatchObject({ status: 200, body: { outcome: 'ring' } });
	});

	it('are never deleted: a year later, with Sherpa down, the copy is served', async () => {
		const { get, clock, sherpa } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer(() => ({ status: 503 }));

		for (const days of [2, 40, 365]) {
			clock.now = START + days * DAY;
			const { body } = await get('lat=0&lon=0&hours=2&cit=RUS');
			expect(body).toMatchObject({ outcome: 'ring', visaRulesLoadedAt: '2026-11-07T00:00:00.000Z' });
		}
	});

	it.each([
		['fewer than 200 countries', { body: sherpaMap('RUS', { absent: SHERPA_COUNTRIES.slice(199) }) }],
		[
			'a group Sherpa did not have',
			{ body: { data: { attributes: { series: [{ type: 'VISA_FREE', data: SHERPA_COUNTRIES.map((id) => ({ id })) }] } } } },
		],
		['no series', { body: { data: { type: 'MAP', attributes: {} } } }],
		[
			'a country without its code',
			{
				body: {
					data: {
						attributes: { series: [{ type: 'NO_VISA_REQUIRED', data: [...SHERPA_COUNTRIES.map((id) => ({ id })), { name: 'Atlantis' }] }] },
					},
				},
			},
		],
		['not JSON', { text: '<html>Bad gateway</html>' }],
	] as const)('are not overwritten by an answer with %s, a failure', async (_, reply) => {
		const { get, clock, sherpa, errors } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer(() => reply);

		clock.now = START + 2 * DAY;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + 3 * DAY;
		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(body.visaRulesLoadedAt).toBe('2026-11-07T00:00:00.000Z');
		expect(errors.map(([, , context]) => context)).toEqual([
			expect.objectContaining({ reason: 'bad_response', citizenship: 'RUS', served: 'stale' }),
			expect.objectContaining({ reason: 'bad_response', citizenship: 'RUS', served: 'stale' }),
		]);
	});
});

describe('a failure of Sherpa', () => {
	const browser = { 'X-POSTHOG-DISTINCT-ID': '019a5f2c-browser', 'X-POSTHOG-SESSION-ID': '019a5f2c-session' };

	it('without a copy answers visa_rules_missing with the citizenship, calculates nothing, and goes to logger.error', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => (passport === 'SRB' ? { status: 503 } : { body: sherpaMap(passport) }));
		const container = recorded(await engineContainer(straightRoad));
		const { get, errors } = api({ container, sherpa });

		const { status, body } = await get('lat=0&lon=0&hours=2&cit=RUS,SRB', browser);

		expect(status).toBe(200);
		expect(body).toEqual({ outcome: 'visa_rules_missing', missingCitizenship: 'SRB' });
		expect(container.bodies).toEqual([]);
		expect(errors).toHaveLength(1);
		const [message, error, context] = errors[0];
		expect(message).toBe('[visa rules] Sherpa failed');
		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({ name: 'SherpaError' });
		// The browser's PostHog ids, and never the origin.
		expect(context).toEqual({
			distinct_id: '019a5f2c-browser',
			session_id: '019a5f2c-session',
			hours: 2,
			reason: '503',
			citizenship: 'SRB',
			served: 'error',
			problem: expect.any(String),
		});
	});

	it('names the first citizenship without rules', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => ({ status: 401 }));
		const { get } = api({ container: await engineContainer(straightRoad), sherpa });

		expect((await get('lat=0&lon=0&hours=2&cit=DEU,RUS,SRB')).body).toEqual({ outcome: 'visa_rules_missing', missingCitizenship: 'DEU' });
	});

	it('is not asked again for that citizenship for 15 min, others are', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => ({ status: 429 }));
		const { get, clock, errors } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer((passport) => ({ body: sherpaMap(passport) }));
		clock.now = START + 15 * MINUTE - 1;
		const marked = await get('lat=0&lon=0&hours=2&cit=RUS');
		const other = await get('lat=0&lon=0&hours=2&cit=SRB');
		clock.now = START + 15 * MINUTE;
		const again = await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(marked.body).toEqual({ outcome: 'visa_rules_missing', missingCitizenship: 'RUS' });
		expect(other.body.outcome).toBe('ring');
		expect(again.body).toMatchObject({ outcome: 'ring', visaRulesLoadedAt: '2026-11-07T00:15:00.000Z' });
		expect(sherpa.passports).toEqual(['RUS', 'SRB', 'RUS']);
		expect(errors).toHaveLength(1);
	});

	it('with a stale copy serves it, goes to logger.error as served stale, and holds the next refresh for 15 min', async () => {
		const { get, clock, sherpa, errors } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=RUS');
		sherpa.answer(() => 'network error');

		clock.now = START + DAY;
		const stale = await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + DAY + 15 * MINUTE - 1;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + DAY + 15 * MINUTE;
		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(stale.body).toMatchObject({ outcome: 'ring', visaRulesLoadedAt: '2026-11-07T00:00:00.000Z' });
		expect(sherpa.passports).toEqual(['RUS', 'RUS', 'RUS']);
		expect(errors.map(([message, error, context]) => [message, (error as Error).name, context])).toEqual([
			['[visa rules] Sherpa failed', 'SherpaError', expect.objectContaining({ reason: 'network', citizenship: 'RUS', served: 'stale' })],
			['[visa rules] Sherpa failed', 'SherpaError', expect.objectContaining({ reason: 'network', citizenship: 'RUS', served: 'stale' })],
		]);
	});

	it('is a timeout after 10 s without an answer', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => 'no answer');
		const { get, errors, timers } = api({ container: await engineContainer(straightRoad), sherpa });

		let answered = false;
		const answer = get('lat=0&lon=0&hours=2&cit=RUS').then((result) => {
			answered = true;
			return result;
		});
		await timers.advance(10_000 - 1);
		expect(answered).toBe(false);
		await timers.advance(1);

		expect((await answer).body).toEqual({ outcome: 'visa_rules_missing', missingCitizenship: 'RUS' });
		expect(errors.map(([, , context]) => context)).toEqual([
			expect.objectContaining({ reason: 'timeout', citizenship: 'RUS', served: 'error' }),
		]);
		// The request itself was aborted.
		expect(sherpa.requests[0].request.signal.aborted).toBe(true);
	});
});

describe('visaRulesLoadedAt', () => {
	it('is when the oldest of the citizenships’ copies came from Sherpa', async () => {
		const { get, clock } = api({ container: await engineContainer(straightRoad) });

		await get('lat=0&lon=0&hours=2&cit=SRB');
		clock.now = START + 5 * HOUR;
		await get('lat=0&lon=0&hours=2&cit=RUS');
		clock.now = START + 6 * HOUR;
		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS,SRB');

		expect(body.visaRulesLoadedAt).toBe('2026-11-07T00:00:00.000Z');
	});
});

describe('the start country', () => {
	// zones.osm: squares of the zones of #13 with no roads, so every origin there is no_roads or no_ring.
	const zones = fixtureGraph('zones.osm');
	const cyprusClosed = (passport: string) => ({
		body: sherpaMap(passport, { groups: { CYP: 'PAPER_OR_EMBASSY_VISA_REQUIRED', NX: 'VISA_ON_ARRIVAL_REQUIRED' } }),
	});

	it('is open in access although the visa rules close it, from the ring cache too; the calculation gets it closed', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(cyprusClosed);
		const container = recorded(await engineContainer(zones));
		const { get } = api({ container, sherpa });

		// In Cyprus, outside Northern Cyprus.
		const calculated = await get('lat=0.5&lon=3.5&hours=2&cit=RUS');
		const cached = await get('lat=0.5&lon=3.5&hours=2&cit=RUS');

		for (const { body } of [calculated, cached]) {
			expect(body).toMatchObject({ outcome: 'no_roads', startCountry: 'CYP' });
			expect(body.access).toMatchObject({ CYP: { mode: 'start' }, NX: { mode: 'visa_on_arrival', citizenship: 'RUS' } });
		}
		expect([calculated.body.source, cached.body.source]).toEqual(['calculation', 'cache']);
		expect(container.bodies).toEqual([expect.objectContaining({ closedCountries: [...CLOSED_FOR_EVERYONE, 'CYP'].sort() })]);
	});

	it('stays closed when it is closed for everyone', async () => {
		const { get } = api({ container: await engineContainer(zones) });

		// In Kosovo.
		const { body } = await get('lat=0.5&lon=0.5&hours=2&cit=RUS');

		expect(body).toMatchObject({ outcome: 'no_ring', startCountry: 'RKS' });
		expect(body.access).toMatchObject({ RKS: { mode: 'closed', closedForEveryone: true } });
	});

	it('leaves access as it is when it is open or a closed territory', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(cyprusClosed);
		const { get } = api({ container: await engineContainer(zones), sherpa });

		// In Northern Cyprus, then in Abkhazia.
		const northernCyprus = await get('lat=0.5&lon=2.5&hours=2&cit=RUS');
		const abkhazia = await get('lat=0.5&lon=13.5&hours=2&cit=RUS');

		expect(northernCyprus.body).toMatchObject({ startCountry: 'NX', access: { NX: { mode: 'visa_on_arrival' }, CYP: { mode: 'closed' } } });
		expect(abkhazia.body).toMatchObject({
			outcome: 'no_ring',
			startCountry: 'ABKHAZIA',
			access: { ABKHAZIA: { mode: 'closed', closedForEveryone: true } },
		});
	});
});

describe('the citizenships', () => {
	it.each([
		['North Korea, which Sherpa takes no passport of', 'PRK'],
		['a dependent territory', 'ABW'],
		['Kosovo by its ISO code', 'XKX'],
		['Northern Cyprus', 'NX'],
	])('of %s are 400, and ask nobody', async (_, citizenship) => {
		const sherpa = new SherpaDouble();
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa });

		const { status } = await get(`lat=0&lon=0&hours=2&cit=${citizenship}`);

		expect(status).toBe(400);
		expect(sherpa.requests).toEqual([]);
		expect(container.bodies).toEqual([]);
	});

	it('are any of the 199 passports Sherpa takes, Kosovo as RKS among them', async () => {
		const { get } = api({ container: await engineContainer(straightRoad) });

		expect((await get('lat=0&lon=0&hours=2&cit=RKS')).status).toBe(200);
		expect((await get('lat=0&lon=0&hours=2&cit=PSE,TWN,VAT')).status).toBe(200);
	});
});

describe('sherpa fetched', () => {
	it('tells each request to Sherpa a request waited for: the citizenship, the result, the status and how long it took', async () => {
		const clock = { now: START };
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => {
			clock.now += 480;
			return { body: sherpaMap(passport) };
		});
		const { get, analytics } = api({ container: await engineContainer(straightRoad), sherpa, clock });

		await get('lat=0&lon=0&hours=2&cit=RUS');
		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('sherpa fetched')).toEqual([
			{ citizenship: 'RUS', result: 'ok', status: 201, duration_ms: 480, mode: 'blocking' },
		]);
	});

	it('tells the background refresh of a stale copy', async () => {
		const { get, clock, analytics } = api({ container: await engineContainer(straightRoad) });
		await get('lat=0&lon=0&hours=2&cit=SRB');

		clock.now = START + DAY;
		await get('lat=0&lon=0&hours=2&cit=SRB');

		expect(analytics.named('sherpa fetched')).toEqual([
			expect.objectContaining({ citizenship: 'SRB', result: 'ok', mode: 'blocking' }),
			{ citizenship: 'SRB', result: 'ok', status: 201, duration_ms: 0, mode: 'background' },
		]);
	});

	it.each([
		['another status', { status: 429 }, { result: 'http_error', status: 429 }],
		['no connection', 'network error', { result: 'http_error' }],
		['a broken answer', { text: '<html>Bad gateway</html>' }, { result: 'bad_response', status: 201 }],
	] as const)('tells a failure: %s', async (_, reply, failure) => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => reply);
		const { get, analytics } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('sherpa fetched')).toEqual([{ citizenship: 'RUS', ...failure, duration_ms: 0, mode: 'blocking' }]);
	});

	it('tells a timeout after 10 s, without a status', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer(() => 'no answer');
		const { get, analytics, timers } = api({ container: await engineContainer(straightRoad), sherpa });

		const answer = get('lat=0&lon=0&hours=2&cit=RUS');
		await timers.advance(10_000);
		await answer;

		expect(analytics.named('sherpa fetched')).toEqual([{ citizenship: 'RUS', result: 'timeout', duration_ms: 10_000, mode: 'blocking' }]);
	});

	it.each(['x-ratelimit-remaining', 'ratelimit-remaining'])('tells what is left of the quota when Sherpa says it in %s', async (header) => {
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => ({ body: sherpaMap(passport), headers: { [header]: '997' } }));
		const { get, analytics } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=2&cit=RUS');

		expect(analytics.named('sherpa fetched')).toEqual([expect.objectContaining({ result: 'ok', quota_remaining: 997 })]);
	});

	it('is not sent while the copy is fresh, or while a failure holds the next request', async () => {
		const sherpa = new SherpaDouble();
		sherpa.answer((passport) => (passport === 'RUS' ? { status: 503 } : { body: sherpaMap(passport) }));
		const { get, clock, analytics } = api({ container: await engineContainer(straightRoad), sherpa });

		await get('lat=0&lon=0&hours=2&cit=RUS,SRB');
		clock.now = START + 15 * MINUTE - 1;
		await get('lat=0&lon=0&hours=2&cit=RUS,SRB');

		expect(
			analytics
				.named('sherpa fetched')
				.map(({ citizenship }) => citizenship)
				.sort(),
		).toEqual(['RUS', 'SRB']);
	});
});
