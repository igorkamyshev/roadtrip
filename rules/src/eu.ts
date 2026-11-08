// The European Union (spec «Экран», «Карточка города»): a car with Russian plates is not let into it, so a city card
// says «Российские номера не пустят» in these zones when a citizenship is Russian. The 27 member states
// (https://european-union.europa.eu/principles-countries-history/eu-countries_en, checked 2026-11-07), and the parts
// of them with their own ISO code that are in the EU (Article 355 TFEU): the outermost regions of France and Åland.
// The zones of the graph are OSM's countries, so a city there is mostly in its state's zone anyway.

/** Alpha-3 of the zones in the EU. */
export const EU: readonly string[] = [
	'AUT',
	'BEL',
	'BGR',
	'CYP',
	'CZE',
	'DEU',
	'DNK',
	'ESP',
	'EST',
	'FIN',
	'FRA',
	'GRC',
	'HRV',
	'HUN',
	'IRL',
	'ITA',
	'LTU',
	'LUX',
	'LVA',
	'MLT',
	'NLD',
	'POL',
	'PRT',
	'ROU',
	'SVK',
	'SVN',
	'SWE',
	// Outermost regions of France: Guadeloupe, French Guiana, Martinique, Mayotte, Réunion, Saint Martin.
	'GLP',
	'GUF',
	'MTQ',
	'MYT',
	'REU',
	'MAF',
	// Åland, of Finland.
	'ALA',
];
