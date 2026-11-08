// The held visas in the ring API (spec «Визовые правила и сведение», «API кольца», «Решения по тестам», seam 2;
// #11, #31): a country's visa opens the country, SCHENGEN all of Schengen, and the visa exemptions' rows open more,
// by today's UTC date and the citizenships. Sherpa is a faked `fetch` (test/api.ts); the exemptions' rows are the
// test's own, so that the Owner's monthly edits of the table never touch these tests.
import { fixtureGraph } from 'data/fixture-graph';
import type { ExemptionVisa, VisaExemption } from 'rules';
import { describe, expect, it } from 'vitest';
import { api, counted, engineContainer, recorded, SherpaDouble, sherpaMap, type SherpaGroup } from '../test/api.ts';

const straightRoad = fixtureGraph('straight-road.osm');

/** Sherpa, answering every passport with `groups` and the rest closed (a paper visa). */
function sherpaClosing(groups: Readonly<Record<string, SherpaGroup>> = {}): SherpaDouble {
	const sherpa = new SherpaDouble();
	sherpa.answer((passport) => ({ body: sherpaMap(passport, { groups, rest: 'PAPER_OR_EMBASSY_VISA_REQUIRED' }) }));
	return sherpa;
}

/** A row of the visa exemptions' table: `country` lets in holders of `visa` without a visa of its own. */
function exemption(country: string, visa: ExemptionVisa, fields: Partial<VisaExemption> = {}): VisaExemption {
	return {
		country,
		visa,
		gives: 'visa_free',
		conditions: 'действующая виза',
		checked: '2026-11-07',
		sources: ['https://example.org/rule'],
		...fields,
	};
}

async function closedCountries(container: { bodies: unknown[] }): Promise<string[]> {
	return (container.bodies.at(-1) as { closedCountries: string[] }).closedCountries;
}

describe('a held visa', () => {
	it('of a country opens that country, by that visa', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa: sherpaClosing(), visaExemptions: [] });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=GEO');

		expect(body.access).toMatchObject({ GEO: { mode: 'held_visa', visa: 'GEO' }, ARM: { mode: 'closed' } });
		expect(await closedCountries(container)).not.toContain('GEO');
		expect(await closedCountries(container)).toContain('ARM');
	});

	it('of any country outside Schengen opens it, one without a passport of Sherpa’s too', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa: sherpaClosing(), visaExemptions: [] });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=GRL,NX');

		expect(body.access).toMatchObject({ GRL: { mode: 'held_visa', visa: 'GRL' }, NX: { mode: 'held_visa', visa: 'NX' } });
		expect(await closedCountries(container)).not.toContain('GRL');
	});

	it('SCHENGEN opens all of Schengen with the four entered through it, and no country beyond without a row', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa: sherpaClosing(), visaExemptions: [] });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=SCHENGEN');

		// The 29 states (home-affairs.ec.europa.eu, 2026-11-07), then Gibraltar, Monaco, San Marino and the Vatican.
		const schengen = [
			'AUT', 'BEL', 'BGR', 'CHE', 'CZE', 'DEU', 'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GRC', 'HRV', 'HUN', 'ISL', 'ITA', 'LIE',
			'LTU', 'LUX', 'LVA', 'MLT', 'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'SWE', 'GIB', 'MCO', 'SMR', 'VAT',
		];
		const access = body.access as Record<string, unknown>;
		for (const country of schengen) {
			expect(access[country], country).toEqual({ mode: 'held_visa', visa: 'SCHENGEN' });
		}
		expect(Object.keys(access).filter((country) => (access[country] as { mode: string }).mode === 'held_visa').sort()).toEqual(
			[...schengen].sort(),
		);
		// Cyprus and Ireland are in the EU, not in Schengen.
		expect(access).toMatchObject({ CYP: { mode: 'closed' }, IRL: { mode: 'closed' } });
		const closed = await closedCountries(container);
		expect(closed.filter((country) => schengen.includes(country))).toEqual([]);
	});
});

describe("the visa exemptions' rows", () => {
	it('open their country to a holder of their visa, by that visa, and not to others', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({
			container,
			sherpa: sherpaClosing(),
			visaExemptions: [exemption('MNE', 'SCHENGEN'), exemption('MNE', 'USA'), exemption('MEX', 'USA')],
		});

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=SCHENGEN');

		expect(body.access).toMatchObject({ MNE: { mode: 'held_visa', visa: 'SCHENGEN' }, MEX: { mode: 'closed' } });
		expect(await closedCountries(container)).not.toContain('MNE');
		expect(await closedCountries(container)).toContain('MEX');
	});

	it('act up to their last day by the date in UTC, and not after it', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const clock = { now: Date.parse('2026-12-31T23:59:59.999Z') };
		const { get } = api({
			container,
			clock,
			sherpa: sherpaClosing(),
			visaExemptions: [exemption('MKD', 'SCHENGEN'), exemption('MKD', 'USA', { until: '2026-12-31' })],
		});

		// Already 1 January in Skopje, still 31 December in UTC.
		expect((await get('lat=0&lon=0&hours=2&cit=RUS&visas=USA')).body.access).toMatchObject({ MKD: { mode: 'held_visa', visa: 'USA' } });
		clock.now = Date.parse('2027-01-01T00:00:00Z');
		expect((await get('lat=0&lon=0&hours=2&cit=RUS&visas=USA')).body.access).toMatchObject({ MKD: { mode: 'closed' } });
		expect(await closedCountries(container)).toContain('MKD');
		// A row without a last day goes on.
		expect((await get('lat=0&lon=0&hours=2&cit=RUS&visas=SCHENGEN')).body.access).toMatchObject({ MKD: { mode: 'held_visa', visa: 'SCHENGEN' } });
	});

	it('that name citizenships act only for a person of one of them', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({
			container,
			sherpa: sherpaClosing(),
			visaExemptions: [exemption('COL', 'USA', { citizenships: ['CHN', 'IND'] }), exemption('MEX', 'USA')],
		});

		expect((await get('lat=0&lon=0&hours=2&cit=RUS&visas=USA')).body.access).toMatchObject({
			COL: { mode: 'closed' },
			MEX: { mode: 'held_visa', visa: 'USA' },
		});
		expect(await closedCountries(container)).toContain('COL');
		// One of the citizenships is enough.
		expect((await get('lat=0&lon=0&hours=2&cit=IND,RUS&visas=USA')).body.access).toMatchObject({ COL: { mode: 'held_visa', visa: 'USA' } });
		expect(await closedCountries(container)).not.toContain('COL');
	});

	it('that give an e-visa make their country one of an e-visa, by their visa', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa: sherpaClosing(), visaExemptions: [exemption('MAR', 'SCHENGEN', { gives: 'evisa' })] });

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=SCHENGEN');

		expect(body.access).toMatchObject({ MAR: { mode: 'evisa', visa: 'SCHENGEN' } });
		expect(await closedCountries(container)).not.toContain('MAR');
	});
});

describe('the entry mode', () => {
	it('is the best of the citizenships and the held visas: visa-free, by a held visa, on arrival, an e-visa, else closed', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({
			container,
			sherpa: sherpaClosing({
				SRB: 'NO_VISA_REQUIRED',
				KHM: 'VISA_ON_ARRIVAL_REQUIRED',
				GEO: 'EVISA_OR_ETA_REQUIRED',
				EGY: 'VISA_ON_ARRIVAL_REQUIRED',
				TUR: 'EVISA_OR_ETA_REQUIRED',
				ALB: 'EVISA_OR_ETA_REQUIRED',
			}),
			visaExemptions: [
				exemption('SRB', 'SCHENGEN'),
				exemption('ALB', 'SCHENGEN'),
				exemption('EGY', 'SCHENGEN', { gives: 'evisa' }),
				exemption('TUR', 'SCHENGEN', { gives: 'evisa' }),
				exemption('OMN', 'SCHENGEN', { gives: 'evisa' }),
				exemption('MNE', 'SCHENGEN'),
				exemption('MNE', 'USA'),
			],
		});

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=GEO,KHM,MNE,SCHENGEN,SRB,USA');

		expect(body.access).toMatchObject({
			// Without a visa by the citizenship, over a held visa and a row.
			SRB: { mode: 'visa_free', citizenship: 'RUS' },
			// By a held visa, over a visa on arrival and an e-visa, the country's own or a row's.
			KHM: { mode: 'held_visa', visa: 'KHM' },
			GEO: { mode: 'held_visa', visa: 'GEO' },
			ALB: { mode: 'held_visa', visa: 'SCHENGEN' },
			// A visa on arrival over a row's e-visa.
			EGY: { mode: 'visa_on_arrival', citizenship: 'RUS' },
			// The same mode by the citizenship and a row: the citizenship's, which needs no visa.
			TUR: { mode: 'evisa', citizenship: 'RUS' },
			OMN: { mode: 'evisa', visa: 'SCHENGEN' },
			// The country's own visa, over the rows; then Schengen, the USA, the UK and Canada, in that order.
			MNE: { mode: 'held_visa', visa: 'MNE' },
			ARM: { mode: 'closed' },
		});
		expect((body.access as Record<string, object>).OMN).toEqual({ mode: 'evisa', visa: 'SCHENGEN' });
	});

	it('of a row with two held visas is by the first of Schengen, the USA, the UK and Canada', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({
			container,
			sherpa: sherpaClosing(),
			visaExemptions: [exemption('GEO', 'CAN'), exemption('GEO', 'GBR'), exemption('MEX', 'CAN'), exemption('MEX', 'USA')],
		});

		const { body } = await get('lat=0&lon=0&hours=2&cit=RUS&visas=CAN,GBR,USA');

		expect(body.access).toMatchObject({ GEO: { mode: 'held_visa', visa: 'GBR' }, MEX: { mode: 'held_visa', visa: 'USA' } });
	});

	it('of a country closed for everyone stays closed, whatever visa is held; that of a citizenship is visa-free', async () => {
		const container = recorded(await engineContainer(straightRoad));
		const { get } = api({ container, sherpa: sherpaClosing() });

		const { body } = await get('lat=0&lon=0&hours=2&cit=SRB&visas=SRB,UKR');

		expect(body.access).toMatchObject({
			UKR: { mode: 'closed', closedForEveryone: true },
			SRB: { mode: 'visa_free', citizenship: 'SRB' },
		});
		expect(await closedCountries(container)).toContain('UKR');
	});
});

describe('the held visas of a request', () => {
	it.each([
		['a Schengen country, which is held only as Schengen', 'DEU'],
		['Gibraltar, in Schengen too', 'GIB,SCHENGEN'],
		['a code that is no country', 'GBR,XXX'],
	])('with %s is 400, and goes nowhere', async (_, visas) => {
		const container = counted(await engineContainer(straightRoad));
		const { get } = api({ container });

		const { status, body } = await get(`lat=0&lon=0&hours=2&cit=RUS&visas=${visas}`);

		expect(status).toBe(400);
		expect(body).toEqual({ error: expect.stringContaining('visas') });
		expect(container.calls).toBe(0);
	});

	it.each([
		['Schengen and the four', 'CAN,GBR,SCHENGEN,USA'],
		['countries outside Schengen', 'AND,CYP,GEO,IRL,RKS,TUR'],
		['countries without a passport of Sherpa’s: territories, North Korea, Northern Cyprus', 'GRL,NX,PRI,PRK'],
	])(
		'with %s is answered',
		async (_, visas) => {
			const { get } = api({ container: await engineContainer(straightRoad) });

			expect((await get(`lat=0&lon=0&hours=2&cit=RUS&visas=${visas}`)).status).toBe(200);
		},
	);
});

