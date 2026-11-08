// The countries of COUNTRIES (rules) without a zone in the world's dataset: publishing refuses a dataset in which any
// other country has none (src/publish.ts), as the world build of 2026-11-07 once lost the USA. From that dataset's
// zone outlines (zones.json): 221 zones, which hold every country of COUNTRIES but these 35. The groups say whose
// outline holds each one's land, by a town of it, as that file shows.

/**
 * Alpha-3. A country that gets a zone leaves the list; one that loses it for good (in OSM, not in a broken build)
 * joins it with the reason.
 */
export const ZONELESS_COUNTRIES: ReadonlySet<string> = new Set([
	// In France's outline: its overseas departments, collectivities and lands.
	'ATF',
	'BLM',
	'GLP',
	'GUF',
	'MAF',
	'MTQ',
	'MYT',
	'NCL',
	'PYF',
	'REU',
	'SPM',
	'WLF',
	// In the USA's: its territories.
	'ASM',
	'GUM',
	'MNP',
	'PRI',
	'UMI',
	'VIR',
	// In the Netherlands': the islands of the Kingdom in the Caribbean.
	'ABW',
	'BES',
	'CUW',
	'SXM',
	// In Australia's: its external territories.
	'CCK',
	'CXR',
	'HMD',
	'NFK',
	// In Norway's: Bouvet Island, Svalbard and Jan Mayen.
	'BVT',
	'SJM',
	// In China's: Hong Kong and Macau.
	'HKG',
	'MAC',
	// In Finland's: Åland.
	'ALA',
	// In Italy's: the Vatican, 0.44 km², under the 2 × 2 km an outline's ring takes (src/outlines.ts).
	'VAT',
	// Zones of #13 instead: WESTERN_SAHARA, and GAZA with the West Bank in no polygon (data/AGENTS.md, «Cities file»).
	'ESH',
	'PSE',
	// In no outline: Antarctica.
	'ATA',
]);
