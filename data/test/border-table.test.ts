// The border table's check (rules' borderTableProblems), which buildGraph runs before a build. Here, not in rules:
// the tests of every package run under data's vitest and types.
import { type BorderTable, borderTable, borderTableProblems } from 'rules';
import { describe, expect, it } from 'vitest';
import { crossing, pair, rules } from './rules.ts';

describe('the border table', () => {
	it('as shipped has no problems', () => {
		expect(borderTableProblems(borderTable)).toEqual([]);
	});

	it('as shipped closes for everyone the countries and territories of #13, and holds Schengen and its four', () => {
		expect({ countries: borderTable.closedForEveryone, territories: borderTable.closedTerritories.map(({ code }) => code) }).toEqual({
			countries: ['AZE', 'BTN', 'CHN', 'MMR', 'RKS', 'UKR'],
			territories: ['ABKHAZIA', 'CRIMEA', 'GAZA', 'SOUTH_OSSETIA', 'WESTERN_SAHARA'],
		});
		expect(borderTable.schengen).toHaveLength(29 + 4);
		expect(borderTable.schengen).toEqual(expect.arrayContaining(['BGR', 'ROU', 'CHE', 'NOR', 'ISL', 'LIE', 'MCO', 'SMR', 'VAT', 'GIB']));
		expect(borderTable.schengen).not.toEqual(expect.arrayContaining(['CYP']));
		expect(borderTable.schengen).not.toEqual(expect.arrayContaining(['IRL']));
		expect(borderTable.defaultBorderHours).toBe(1.5);
	});

	it('as shipped crosses a border that differs by citizenship as a citizen of Russia does (#13), and Narva only on foot', () => {
		const shippedPair = (one: string, two: string) => borderTable.pairs.find(({ pair: [a, b] }) => a === one && b === two);
		const shippedCrossing = (id: string) => borderTable.crossings.find((row) => row.id === id);

		expect(shippedPair('BLR', 'RUS')).toMatchObject({ status: 'no_control' });
		expect(shippedPair('BLR', 'RUS')?.borderHours).toBeUndefined();
		expect(shippedPair('SYR', 'TUR')).toMatchObject({ status: 'closed' });
		expect(shippedCrossing('kayragach')).toMatchObject({ pair: ['KGZ', 'TJK'], status: 'closed' });
		expect(shippedPair('IND', 'NPL')).toBeUndefined(); // passport control, the default 1.5 h
		expect(shippedPair('EST', 'RUS')).toMatchObject({ status: 'crossings_only' });
		expect(shippedCrossing('narva')).toMatchObject({ pair: ['EST', 'RUS'], status: 'pedestrian_only' });
	});

	it.each<[string, BorderTable, string]>([
		['a pair out of order', rules({ pairs: [{ ...pair('closed'), pair: ['BBB', 'AAA'] }] }), 'alphabetical order'],
		['a pair twice', rules({ pairs: [pair('closed'), pair('no_crossing')] }), 'two rows'],
		['a pair with a country closed for everyone', rules({ pairs: [pair('closed')], closedForEveryone: ['BBB'] }), 'need no rows'],
		['a pair inside Schengen', rules({ pairs: [pair('no_control')], schengen: ['AAA', 'BBB'] }), 'Schengen'],
		['a border delay at a closed pair', rules({ pairs: [pair('closed', { borderHours: 1 })] }), 'no border delay'],
		[
			'a crossings_only pair with no open crossing',
			rules({ pairs: [pair('crossings_only')], crossings: [crossing('shut', 0, 1, 'closed')] }),
			'no open crossing',
		],
		['a crossing of a closed pair', rules({ pairs: [pair('closed')], crossings: [crossing('there', 0, 1, 'open')] }), 'changes nothing'],
		['a crossing twice', rules({ crossings: [crossing('there', 0, 1, 'open'), crossing('there', 0.5, 1, 'open')] }), 'two rows'],
		['a crossing off the globe', rules({ crossings: [crossing('there', 95, 1, 'open')] }), 'not coordinates'],
		['a date that is not one', rules({ pairs: [pair('closed', { checked: '07.11.2026' })] }), 'not a date'],
		['a source that is not a link', rules({ pairs: [pair('closed', { sources: ['FCDO'] })] }), 'not a link'],
		[
			'a territory with a code like a country’s',
			rules({ closedTerritories: [{ code: 'ABK', name: 'Абхазия' }] }),
			'longer than an alpha-3',
		],
		['a code that is not a country’s', rules({ closedForEveryone: ['Ukraine'] }), 'not a country'],
	])('finds %s', (_, table, problem) => {
		expect(borderTableProblems(table).join('\n')).toContain(problem);
	});
});
