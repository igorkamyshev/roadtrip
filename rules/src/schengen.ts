// The Schengen area as the site sees it (spec «Таблица границ», «Визовые правила и сведение»; #9, #13): no border
// delay between two of these on any road, and a held Schengen visa (`SCHENGEN`) opens all of them. The border
// table holds it as `schengen`, so it is part of the table's hash; the held visas (held-visas.ts) read it here, so
// the client gets it without the border table.

/**
 * The 29 states of https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en (checked 2026-11-07), then
 * the four entered only through them without border control, which follow Schengen's visa policy (research
 * visa-exemptions, «Состав Шенгена»): Gibraltar since 2026-07-15, Monaco, San Marino and the Vatican. Not Cyprus
 * and Ireland, nor Andorra, whose return into Schengen is a new entry (the visa exemptions' table has its row).
 */
export const SCHENGEN_AREA: readonly string[] = [
	'AUT', 'BEL', 'BGR', 'CHE', 'CZE', 'DEU', 'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GRC', 'HRV', 'HUN', 'ISL', 'ITA', 'LIE',
	'LTU', 'LUX', 'LVA', 'MLT', 'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'SWE',
	'GIB', 'MCO', 'SMR', 'VAT',
];
