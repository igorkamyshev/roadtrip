// A tiny dump of Wikidata's sitelinks in the layout of `wikidatawiki-latest-wb_items_per_site.sql.gz`: MariaDB's
// statements, the rows `(ips_row_id, ips_item_id, 'ips_site_id', 'ips_site_page')` in INSERT statements, by default as
// MariaDB 10.11 writes them (`INSERT INTO … VALUES` on its own line, then a row a line), or in long INSERT lines.

/** An item's sitelinks: how many, and its ruwiki title among them, if it has one. */
export interface ItemSitelinks {
	readonly count: number;
	readonly ruwiki?: string;
}

/**
 * How the dump lays out an INSERT statement of `perStatement` rows: `rowALine`, as MariaDB 10.11's dump of 2026-11,
 * `INSERT INTO … VALUES` on its own line and then a row a line, the last ending in `;`; or `longLine`, the statement
 * and its rows on one line.
 */
export interface DumpLayout {
	readonly lines: 'rowALine' | 'longLine';
	readonly perStatement: number;
}

/** A string of MySQL's dump: in quotes, a quote and a backslash escaped. */
const quoted = (text: string) => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

const INSERT = 'INSERT INTO `wb_items_per_site` VALUES';

/** The layout of the real dump, 7 rows a statement so that the tests' items take several. */
const MARIADB_LAYOUT: DumpLayout = { lines: 'rowALine', perStatement: 7 };

/** The lines of the dump of the items' sitelinks, by Q-id. */
export function sitelinksDump(
	items: Readonly<Record<number, ItemSitelinks>>,
	{ lines, perStatement }: DumpLayout = MARIADB_LAYOUT,
): string[] {
	const rows: string[] = [];
	for (const [qid, { count, ruwiki }] of Object.entries(items)) {
		for (let site = 0; site < count; site++) {
			const ru = ruwiki !== undefined && site === 0;
			rows.push(`(${rows.length + 1},${qid},${quoted(ru ? 'ruwiki' : `x${site}wiki`)},${quoted(ru ? ruwiki : `Page ${qid}`)})`);
		}
	}
	const inserts: string[] = [];
	for (let start = 0; start < rows.length; start += perStatement) {
		const statement = rows.slice(start, start + perStatement);
		if (lines === 'longLine') {
			inserts.push(`${INSERT} ${statement.join(',')};`);
		} else {
			inserts.push(INSERT, ...statement.map((row, index) => `${row}${index === statement.length - 1 ? ';' : ','}`));
		}
	}
	return [
		'-- MariaDB dump 10.19  Distrib 10.11.19-MariaDB, for debian-linux-gnu (x86_64)',
		'DROP TABLE IF EXISTS `wb_items_per_site`;',
		'CREATE TABLE `wb_items_per_site` (',
		'  `ips_row_id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,',
		'  `ips_item_id` int(10) unsigned NOT NULL,',
		'  `ips_site_id` varbinary(32) NOT NULL,',
		'  `ips_site_page` varbinary(310) NOT NULL,',
		'  PRIMARY KEY (`ips_row_id`)',
		') ENGINE=InnoDB DEFAULT CHARSET=binary;',
		'/*!40000 ALTER TABLE `wb_items_per_site` DISABLE KEYS */;',
		...inserts,
		'/*!40000 ALTER TABLE `wb_items_per_site` ENABLE KEYS */;',
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
