// A tiny dump of Wikidata's sitelinks in the layout of `wikidatawiki-latest-wb_items_per_site.sql.gz`: MariaDB's
// statements, the rows `(ips_row_id, ips_item_id, 'ips_site_id', 'ips_site_page')` in INSERT statements, by default as
// MariaDB 10.11 writes them (`INSERT INTO … VALUES` on its own line, then a row a line), or in long INSERT lines. Its
// header and INSERT line are those of the real dump's head (`fixtures/wikidata/wb_items_per_site-head.sql`, the
// first rows of the dump of 2026-11, by `curl -r 0-2000000`), so it follows the file it stands for.

import { readFileSync } from 'node:fs';

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

/** The real dump's head, a line each. */
const SAMPLE = readFileSync(new URL('fixtures/wikidata/wb_items_per_site-head.sql', import.meta.url), 'utf8').split('\n');

/** The real dump's first INSERT line, which opens every statement. */
const INSERT_AT = SAMPLE.findIndex((line) => line.startsWith('INSERT INTO'));
const INSERT = SAMPLE[INSERT_AT];

/** The real dump's statements before its rows: the table's structure and the settings. */
const HEADER = SAMPLE.slice(0, INSERT_AT);

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
	return [...HEADER, ...inserts, '/*!40000 ALTER TABLE `wb_items_per_site` ENABLE KEYS */;', '-- Dump completed on 2026-11-01  2:17:12'];
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
