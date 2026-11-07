// The visa exemptions' table (rules' VISA_EXEMPTIONS) and its check, visaExemptionsProblems: what the types cannot
// say about a row. `pnpm test` runs it on every push, so a table with a problem never deploys with the Worker.
import { type VisaExemption, VISA_EXEMPTIONS, visaExemptionsProblems } from 'rules';
import { describe, expect, it } from 'vitest';

const row = (fields: Partial<VisaExemption> = {}): VisaExemption => ({
	country: 'MNE',
	visa: 'SCHENGEN',
	gives: 'visa_free',
	conditions: 'действующая виза',
	checked: '2026-11-07',
	sources: ['https://www.sluzbenilist.me/propisi/399550'],
	...fields,
});

describe("the visa exemptions' table", () => {
	it('as shipped has no problems', () => {
		expect(visaExemptionsProblems(VISA_EXEMPTIONS)).toEqual([]);
	});

	it.each<[string, readonly VisaExemption[], string]>([
		['a country that is no country', [row({ country: 'XKX' })], 'not a country'],
		['Northern Cyprus, which has no alpha-3', [row({ country: 'NX' })], 'not a country'],
		['a country closed for everyone', [row({ country: 'RKS' })], 'closed for everyone'],
		['Schengen’s visa for a Schengen country', [row({ country: 'MCO' })], 'Schengen'],
		['a visa for its own country', [row({ country: 'USA', visa: 'USA' })], 'its own country'],
		['a country twice for one visa', [row(), row({ gives: 'evisa' })], 'two rows'],
		['a last day that is not a date', [row({ until: '31.12.2026' })], 'not a date'],
		['a last day that does not exist', [row({ until: '2026-02-30' })], 'not a date'],
		['an empty list of citizenships', [row({ citizenships: [] })], 'leave it out'],
		['a citizenship that is no country', [row({ citizenships: ['CHN', 'XKX'] })], 'XKX is not a country'],
		['citizenships out of order', [row({ citizenships: ['IND', 'CHN'] })], 'sorted'],
		['a citizenship twice', [row({ citizenships: ['CHN', 'CHN'] })], 'sorted'],
		['no conditions', [row({ conditions: ' ' })], 'conditions'],
		['a checked date that is not one', [row({ checked: '07.11.2026' })], 'not a date'],
		['no source', [row({ sources: [] })], 'no source'],
		['a source that is not a link', [row({ sources: ['МИД'] })], 'not a link'],
	])('finds %s', (_, rows, problem) => {
		expect(visaExemptionsProblems(rows).join('\n')).toContain(problem);
	});

	it('takes the same country for other visas, and a list of citizenships', () => {
		expect(visaExemptionsProblems([row(), row({ visa: 'USA', until: '2026-12-31', citizenships: ['CHN', 'IND'] })])).toEqual([]);
	});
});
