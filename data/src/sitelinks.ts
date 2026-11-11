// Wikidata's sitelinks, from the SQL dump of the table `wb_items_per_site` (ADR 0003, CC0): a row per item and wiki
// of any project of Wikimedia, `(ips_row_id, ips_item_id, 'ips_site_id', 'ips_site_page')`, in INSERT statements:
// MariaDB 10.11's dump (2026-11) writes `INSERT INTO … VALUES` on its own line and then a row a line, the last ending in
// `;`; older dumps, a statement and its rows on one long line. Either is read a line at a time, as the dump streams.
// The number of an item's rows is the place's fame; its row of ruwiki holds the title of its article in Russian.

/** An item's sitelinks. */
export interface Sitelinks {
	/** In every project of Wikimedia. */
	readonly count: number;
	/** The title of its article in the Russian Wikipedia, if it has one. */
	readonly ruwiki: string | undefined;
}

/** A row of the table: the item, the wiki and the page, each string in quotes with `\` escaping. */
const ROW = /\(\d+,(\d+),'((?:[^'\\]|\\.)*)','((?:[^'\\]|\\.)*)'\)/gu;

/** MySQL's escapes in a dumped string: `\'`, `\\`, `\"` and the like stand for the character after the backslash. */
const ESCAPE = /\\(.)/gu;

/** The sitelinks of the items `qids` (numbers: 1029310 for Q1029310) from the lines of the dump; an item without any is not in the map. */
export async function readSitelinks(lines: AsyncIterable<string>, qids: ReadonlySet<number>): Promise<Map<number, Sitelinks>> {
	const counts = new Map<number, number>();
	const ruwiki = new Map<number, string>();
	// Whether the line is in an INSERT statement's rows: from its `INSERT INTO` to the line that ends it with `;`.
	let inRows = false;
	for await (const line of lines) {
		inRows ||= line.startsWith('INSERT INTO');
		if (!inRows) {
			continue;
		}
		inRows = !line.trimEnd().endsWith(';');
		for (const [, item, site, page] of line.matchAll(ROW)) {
			const qid = Number(item);
			if (!qids.has(qid)) {
				continue;
			}
			counts.set(qid, (counts.get(qid) ?? 0) + 1);
			if (site === 'ruwiki') {
				ruwiki.set(qid, page.replaceAll(ESCAPE, '$1'));
			}
		}
	}
	return new Map([...counts].map(([qid, count]) => [qid, { count, ruwiki: ruwiki.get(qid) }]));
}
