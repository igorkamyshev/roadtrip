// The visa rules in the ring API (spec «Визовые правила и сведение», «API кольца», «Решения по тестам», seam 2; #11):
// Sherpa's classes per citizenship, reduced to an entry mode per country, whose closed countries the calculation
// avoids; Sherpa's copies in KV. Sherpa is a faked `fetch` (test/api.ts) answering in the shape of 2026-11-07.
import { fixtureGraph } from 'data/fixture-graph';
import { describe, expect, it } from 'vitest';
import { api, engineContainer, recorded, SherpaDouble, sherpaMap } from '../test/api.ts';

const straightRoad = fixtureGraph('straight-road.osm');

/** The countries closed for everyone (rules' border table), closed in every set. */
const CLOSED_FOR_EVERYONE = ['AZE', 'BTN', 'CHN', 'MMR', 'RKS', 'UKR'];

describe('the visa rules', () => {
	it("give each country Sherpa lists its entry mode, and close those it does not", async () => {
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
});
