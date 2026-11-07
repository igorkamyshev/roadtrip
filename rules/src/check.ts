import type { BorderTable } from './index.ts';

/** A country's zone code: an alpha-3, or Sherpa's `NX` for Northern Cyprus (#13). */
const COUNTRY_CODE = /^(?:[A-Z]{3}|NX)$/u;
/** A closed territory's zone code: longer than an alpha-3, so it never is one. */
const TERRITORY_CODE = /^[A-Z][A-Z_]{3,}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const BLOCKING = new Set(['closed', 'no_crossing', 'pedestrian_only']);

/**
 * What is wrong with the border table beyond its types: unknown or repeated codes, pairs out of order or for a
 * country closed for everyone, a `crossings_only` pair with no open crossing, a crossing of a closed pair, and
 * dates, sources and coordinates that are not ones. Empty when the table is fine.
 */
export function borderTableProblems(table: BorderTable): string[] {
	const problems: string[] = [];
	const closed = new Set([...table.closedForEveryone, ...table.closedTerritories.map((territory) => territory.code)]);
	const schengen = new Set(table.schengen);

	if (!(Number.isFinite(table.defaultBorderHours) && table.defaultBorderHours > 0)) {
		problems.push(`the default border delay ${table.defaultBorderHours} is not a positive number of hours`);
	}
	problems.push(...repeated('closedForEveryone', table.closedForEveryone), ...repeated('schengen', table.schengen));
	for (const code of [...table.closedForEveryone, ...table.schengen]) {
		if (!COUNTRY_CODE.test(code)) {
			problems.push(`${code} is not a country's code`);
		}
	}
	problems.push(...repeated('closedTerritories', [...table.closedTerritories.map((territory) => territory.code)]));
	for (const { code } of table.closedTerritories) {
		if (!TERRITORY_CODE.test(code)) {
			problems.push(`the closed territory ${code} needs a code of capitals and underscores longer than an alpha-3`);
		}
	}
	for (const code of table.schengen) {
		if (closed.has(code)) {
			problems.push(`${code} is in Schengen and closed for everyone`);
		}
	}

	const pairKeys = new Map<string, BorderTable['pairs'][number]>();
	const pairProblems = (what: string, pair: readonly [string, string]) => {
		const [one, two] = pair;
		const found: string[] = [];
		if (!COUNTRY_CODE.test(one) || !COUNTRY_CODE.test(two)) {
			found.push(`${what}: ${one}–${two} is not a pair of country codes`);
		} else if (one >= two) {
			found.push(`${what}: write the pair ${one}–${two} in alphabetical order, without repeats`);
		}
		for (const code of pair) {
			if (closed.has(code)) {
				found.push(`${what}: ${code} is closed for everyone, its borders need no rows (#13)`);
			}
		}
		return found;
	};
	for (const row of table.pairs) {
		const key = row.pair.join('–');
		const what = `the pair ${key}`;
		problems.push(...pairProblems(what, row.pair), ...checkedProblems(what, row));
		if (pairKeys.has(key)) {
			problems.push(`${what} has two rows`);
		}
		pairKeys.set(key, row);
		if (schengen.has(row.pair[0]) && schengen.has(row.pair[1])) {
			problems.push(`${what}: both are in Schengen, which already rules their border`);
		}
		if (row.borderHours !== undefined) {
			if (!(Number.isFinite(row.borderHours) && row.borderHours >= 0)) {
				problems.push(`${what}: the border delay ${row.borderHours} is not a number of hours`);
			}
			if (BLOCKING.has(row.status)) {
				problems.push(`${what}: a ${row.status} border has no border delay`);
			}
		}
	}

	const ids = new Set<string>();
	const openCrossings = new Set<string>();
	for (const crossing of table.crossings) {
		const key = crossing.pair.join('–');
		const what = `the crossing ${crossing.id}`;
		problems.push(...pairProblems(what, crossing.pair), ...checkedProblems(what, crossing));
		if (ids.has(crossing.id)) {
			problems.push(`${what} has two rows`);
		}
		ids.add(crossing.id);
		if (!/^[a-z][a-z0-9_]*$/u.test(crossing.id)) {
			problems.push(`${what}: an id is lowercase latin letters, digits and underscores`);
		}
		if (!(Math.abs(crossing.lat) <= 90 && Math.abs(crossing.lon) <= 180)) {
			problems.push(`${what}: ${crossing.lat}, ${crossing.lon} are not coordinates`);
		}
		if (crossing.osm !== undefined && !/^(?:node|way)\/\d+$/u.test(crossing.osm)) {
			problems.push(`${what}: OSM element ${crossing.osm} is not node/<id> or way/<id>`);
		}
		const status = pairKeys.get(key)?.status;
		if (status !== undefined && BLOCKING.has(status)) {
			problems.push(`${what}: its pair ${key} is ${status}, so the crossing changes nothing`);
		}
		if (crossing.status === 'open') {
			openCrossings.add(key);
		}
	}
	for (const [key, row] of pairKeys) {
		if (row.status === 'crossings_only' && !openCrossings.has(key)) {
			problems.push(`the pair ${key} is crossings_only but has no open crossing`);
		}
	}
	return problems;
}

function repeated(list: string, codes: readonly string[]): string[] {
	return codes.filter((code, index) => codes.indexOf(code) !== index).map((code) => `${code} is twice in ${list}`);
}

function checkedProblems(what: string, row: { readonly checked: string; readonly sources: readonly string[] }): string[] {
	const problems: string[] = [];
	if (!DATE.test(row.checked) || Number.isNaN(Date.parse(row.checked))) {
		problems.push(`${what}: checked ${row.checked} is not a date YYYY-MM-DD`);
	}
	for (const source of row.sources) {
		if (!/^https?:\/\/\S+$/u.test(source)) {
			problems.push(`${what}: the source ${source} is not a link`);
		}
	}
	return problems;
}
