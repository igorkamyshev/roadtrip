// The border table, edited by hand (spec «Таблица границ»). Its schema is in index.ts; `pnpm test` checks it.
import type { BorderTable } from './index.ts';

export const borderTable: BorderTable = {
	defaultBorderHours: 1.5,
	closedForEveryone: ['AZE', 'BTN', 'CHN', 'MMR', 'RKS', 'UKR'],
	closedTerritories: [
		{ code: 'ABKHAZIA', name: 'Абхазия' },
		{ code: 'CRIMEA', name: 'Крым' },
		{ code: 'GAZA', name: 'Газа' },
		{ code: 'SOUTH_OSSETIA', name: 'Южная Осетия' },
		{ code: 'WESTERN_SAHARA', name: 'Западная Сахара' },
	],
	schengen: [
		'AUT', 'BEL', 'BGR', 'CHE', 'CZE', 'DEU', 'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GRC', 'HRV', 'HUN', 'ISL', 'ITA', 'LIE',
		'LTU', 'LUX', 'LVA', 'MLT', 'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'SWE',
		'GIB', 'MCO', 'SMR', 'VAT',
	],
	pairs: [],
	crossings: [],
};
