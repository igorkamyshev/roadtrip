// A tiny dump of Wikidata's sitelinks in the layout of `wikidatawiki-latest-wb_items_per_site.sql.gz`: MySQL's
// statements, the rows `(ips_row_id, ips_item_id, 'ips_site_id', 'ips_site_page')` in long INSERT lines.

/** An item's sitelinks: how many, and its ruwiki title among them, if it has one. */
export interface ItemSitelinks {
	readonly count: number;
	readonly ruwiki?: string;
}

/** A string of MySQL's dump: in quotes, a quote and a backslash escaped. */
const quoted = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** The lines of the dump of the items' sitelinks, by Q-id, `perLine` rows to an INSERT line. */
export function sitelinksDump(items: Readonly<Record<number, ItemSitelinks>>, perLine = 7): string[] {
	const rows: string[] = [];
	for (const [qid, { count, ruwiki }] of Object.entries(items)) {
		for (let site = 0; site < count; site++) {
			const ru = ruwiki !== undefined && site === 0;
			rows.push(`(${rows.length + 1},${qid},${quoted(ru ? 'ruwiki' : `x${site}wiki`)},${quoted(ru ? ruwiki : `Page ${qid}`)})`);
		}
	}
	const inserts: string[] = [];
	for (let start = 0; start < rows.length; start += perLine) {
		inserts.push(`INSERT INTO \`wb_items_per_site\` VALUES ${rows.slice(start, start + perLine).join(',')};`);
	}
	return [
		'-- MySQL dump 10.19  Distrib 10.3.38-MariaDB, for debian-linux-gnu (x86_64)',
		'DROP TABLE IF EXISTS `wb_items_per_site`;',
		'CREATE TABLE `wb_items_per_site` (',
		'  `ips_row_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
		'  `ips_item_id` int(10) unsigned NOT NULL,',
		"  `ips_site_id` varbinary(32) NOT NULL DEFAULT '',",
		"  `ips_site_page` varbinary(310) NOT NULL DEFAULT '',",
		'  PRIMARY KEY (`ips_row_id`)',
		') ENGINE=InnoDB DEFAULT CHARSET=binary;',
		...inserts,
		'-- Dump completed on 2026-11-01  2:17:12',
	];
}

/** The sitelinks of the places of `fixtures/places.osm` (its header), with the ruwiki titles of the tests. */
export const PLACES_SITELINKS: Readonly<Record<number, ItemSitelinks>> = {
	1001: { count: 30, ruwiki: 'Пограничный водопад' },
	1002: { count: 50 },
	1003: { count: 40 },
	1004: { count: 10, ruwiki: "Д'Арк (гора)" },
	1005: { count: 11, ruwiki: 'Каштел (крепость)' },
	1006: { count: 20 },
	1007: { count: 20 },
	1008: { count: 15 },
	1009: { count: 100 },
	1010: { count: 25, ruwiki: 'Заповедник Би (Бета)' },
	1011: { count: 25 },
	1012: { count: 12 },
	1014: { count: 30 },
	1016: { count: 9 },
};
