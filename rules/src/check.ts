import { borderTable } from './border-table.ts';
import { COUNTRIES } from './countries.ts';
import type { BorderCrossing, BorderPair, BorderTable, Pair, VisaExemption } from './index.ts';
import { SCHENGEN_AREA } from './schengen.ts';

/** A country's zone code: an alpha-3, or Sherpa's `NX` for Northern Cyprus (#13). */
const COUNTRY_CODE = /^(?:[A-Z]{3}|NX)$/u;
/** A closed territory's zone code: longer than an alpha-3, so it never is one. */
const TERRITORY_CODE = /^[A-Z][A-Z_]{3,}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const ALPHA_3 = /^[A-Z]{3}$/u;
const BLOCKING = new Set(['closed', 'no_crossing', 'pedestrian_only']);

/**
 * What is wrong with the border table beyond its types: unknown or repeated codes, pairs out of order or for a
 * country closed for everyone, a `crossings_only` pair with no open crossing, a crossing of a closed pair, and
 * dates, sources and coordinates that are not ones. Empty when the table is fine.
 */
export function borderTableProblems(table: BorderTable): string[] {
	const closed = new Set([...table.closedForEveryone, ...table.closedTerritories.map((territory) => territory.code)]);
	// A pair's row by its key; the last of two rows for one pair.
	const pairRows = new Map(table.pairs.map((row): [string, BorderPair] => [row.pair.join('–'), row]));
	return [
		...listsProblems(table, closed),
		...pairRowsProblems(table, closed),
		...crossingsProblems(table, closed, pairRows),
		...crossingsOnlyProblems(table, pairRows),
	];
}

/** The default border delay, and the lists of codes: repeats, codes that are not ones, Schengen's closed countries. */
function listsProblems(table: BorderTable, closed: ReadonlySet<string>): string[] {
	const problems: string[] = [];
	if (!(Number.isFinite(table.defaultBorderHours) && table.defaultBorderHours > 0)) {
		problems.push(`the default border delay ${table.defaultBorderHours} is not a positive number of hours`);
	}
	problems.push(...repeated('closedForEveryone', table.closedForEveryone), ...repeated('schengen', table.schengen));
	for (const code of [...table.closedForEveryone, ...table.schengen]) {
		if (!COUNTRY_CODE.test(code)) {
			problems.push(`${code} is not a country's code`);
		}
	}
	problems.push(
		...repeated(
			'closedTerritories',
			table.closedTerritories.map((territory) => territory.code),
		),
	);
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
	return problems;
}

function repeated(list: string, codes: readonly string[]): string[] {
	return codes.filter((code, index) => codes.indexOf(code) !== index).map((code) => `${code} is twice in ${list}`);
}

/** The rows of pairs: their pair, their check, a second row of a pair, a pair inside Schengen, the border delay. */
function pairRowsProblems(table: BorderTable, closed: ReadonlySet<string>): string[] {
	const schengen = new Set(table.schengen);
	const seen = new Set<string>();
	const problems: string[] = [];
	for (const row of table.pairs) {
		const key = row.pair.join('–');
		const what = `the pair ${key}`;
		problems.push(...pairProblems(what, row.pair, closed), ...checkedProblems(what, row));
		if (seen.has(key)) {
			problems.push(`${what} has two rows`);
		}
		seen.add(key);
		if (schengen.has(row.pair[0]) && schengen.has(row.pair[1])) {
			problems.push(`${what}: both are in Schengen, which already rules their border`);
		}
		problems.push(...borderHoursProblems(what, row));
	}
	return problems;
}

/** A pair that is not two country codes in alphabetical order, or with a country closed for everyone. */
function pairProblems(what: string, pair: Pair, closed: ReadonlySet<string>): string[] {
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
}

function borderHoursProblems(what: string, row: BorderPair): string[] {
	if (row.borderHours === undefined) {
		return [];
	}
	const problems: string[] = [];
	if (!(Number.isFinite(row.borderHours) && row.borderHours >= 0)) {
		problems.push(`${what}: the border delay ${row.borderHours} is not a number of hours`);
	}
	if (BLOCKING.has(row.status)) {
		problems.push(`${what}: a ${row.status} border has no border delay`);
	}
	return problems;
}

/** The crossings: their pair, their check, a second row of an id, their fields, a crossing of a closed pair. */
function crossingsProblems(table: BorderTable, closed: ReadonlySet<string>, pairRows: ReadonlyMap<string, BorderPair>): string[] {
	const ids = new Set<string>();
	const problems: string[] = [];
	for (const crossing of table.crossings) {
		const key = crossing.pair.join('–');
		const what = `the crossing ${crossing.id}`;
		problems.push(...pairProblems(what, crossing.pair, closed), ...checkedProblems(what, crossing));
		if (ids.has(crossing.id)) {
			problems.push(`${what} has two rows`);
		}
		ids.add(crossing.id);
		problems.push(...crossingFieldsProblems(what, crossing));
		const status = pairRows.get(key)?.status;
		if (status !== undefined && BLOCKING.has(status)) {
			problems.push(`${what}: its pair ${key} is ${status}, so the crossing changes nothing`);
		}
	}
	return problems;
}

/** An id, coordinates or an OSM element of a crossing that is not one. */
function crossingFieldsProblems(what: string, crossing: BorderCrossing): string[] {
	const problems: string[] = [];
	if (!/^[a-z][a-z0-9_]*$/u.test(crossing.id)) {
		problems.push(`${what}: an id is lowercase latin letters, digits and underscores`);
	}
	if (!(Math.abs(crossing.lat) <= 90 && Math.abs(crossing.lon) <= 180)) {
		problems.push(`${what}: ${crossing.lat}, ${crossing.lon} are not coordinates`);
	}
	if (crossing.osm !== undefined && !/^(?:node|way)\/\d+$/u.test(crossing.osm)) {
		problems.push(`${what}: OSM element ${crossing.osm} is not node/<id> or way/<id>`);
	}
	return problems;
}

/** A `crossings_only` pair with no open crossing, which no road could cross. */
function crossingsOnlyProblems(table: BorderTable, pairRows: ReadonlyMap<string, BorderPair>): string[] {
	const openCrossings = new Set(
		table.crossings.filter((crossing) => crossing.status === 'open').map((crossing) => crossing.pair.join('–')),
	);
	const problems: string[] = [];
	for (const [key, row] of pairRows) {
		if (row.status === 'crossings_only' && !openCrossings.has(key)) {
			problems.push(`the pair ${key} is crossings_only but has no open crossing`);
		}
	}
	return problems;
}

/** A day of the calendar as YYYY-MM-DD: a date that exists, so not 2026-02-30, which Date.parse takes. */
function isDate(text: string): boolean {
	const time = Date.parse(text);
	return DATE.test(text) && !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

function checkedProblems(what: string, row: { readonly checked: string; readonly sources: readonly string[] }): string[] {
	const problems: string[] = [];
	if (!isDate(row.checked)) {
		problems.push(`${what}: checked ${row.checked} is not a date YYYY-MM-DD`);
	}
	for (const source of row.sources) {
		if (!/^https?:\/\/\S+$/u.test(source)) {
			problems.push(`${what}: the source ${source} is not a link`);
		}
	}
	return problems;
}

/** A country's alpha-3 among rules' `COUNTRIES`: so not Northern Cyprus (`NX`), nor Kosovo as XKX (it is RKS). */
function isCountry(code: string): boolean {
	return ALPHA_3.test(code) && code in COUNTRIES;
}

/**
 * What is wrong with the visa exemptions' table beyond its types: a country that is not one, closed for everyone
 * (#13: the row would open nothing; its rule waits in the table's comment), in Schengen for Schengen's visa or the
 * visa's own country (the held visa opens those already); a country twice for one visa; a last day, a checked date
 * or a source that is not one; citizenships that are not countries' codes, sorted and once each; no conditions.
 * Empty when the table is fine.
 */
export function visaExemptionsProblems(rows: readonly VisaExemption[]): string[] {
	const problems: string[] = [];
	const closedForEveryone = new Set(borderTable.closedForEveryone);
	const seen = new Set<string>();
	for (const row of rows) {
		const what = `the row ${row.country} by ${row.visa}`;
		problems.push(...countryProblems(what, row, closedForEveryone));
		const key = `${row.country} ${row.visa}`;
		if (seen.has(key)) {
			problems.push(`${what} has two rows`);
		}
		seen.add(key);
		if (row.until !== undefined && !isDate(row.until)) {
			problems.push(`${what}: the last day ${row.until} is not a date YYYY-MM-DD`);
		}
		problems.push(...citizenshipsProblems(what, row.citizenships));
		if (row.conditions.trim() === '') {
			problems.push(`${what}: write its conditions, for people`);
		}
		if (row.sources.length === 0) {
			problems.push(`${what}: has no source`);
		}
		problems.push(...checkedProblems(what, row));
	}
	return problems;
}

/** A row's country that is not one, is closed for everyone, or is opened by the visa already. */
function countryProblems(what: string, row: VisaExemption, closedForEveryone: ReadonlySet<string>): string[] {
	const problems: string[] = [];
	if (!isCountry(row.country)) {
		problems.push(`${what}: ${row.country} is not a country's alpha-3`);
	}
	if (closedForEveryone.has(row.country)) {
		problems.push(`${what}: ${row.country} is closed for everyone (#13), so the row would open nothing`);
	}
	if (row.visa === 'SCHENGEN' && SCHENGEN_AREA.includes(row.country)) {
		problems.push(`${what}: ${row.country} is in Schengen, which Schengen's visa opens already`);
	}
	if (row.visa === row.country) {
		problems.push(`${what}: a held visa opens its own country already`);
	}
	return problems;
}

/** A row's citizenships that are none, not countries' codes, or not sorted and once each. */
function citizenshipsProblems(what: string, citizenships: readonly string[] | undefined): string[] {
	if (citizenships === undefined) {
		return [];
	}
	const problems: string[] = [];
	if (citizenships.length === 0) {
		problems.push(`${what}: an empty list of citizenships is for nobody; leave it out for everybody`);
	}
	for (const citizenship of citizenships) {
		if (!isCountry(citizenship)) {
			problems.push(`${what}: the citizenship ${citizenship} is not a country's alpha-3`);
		}
	}
	if (citizenships.some((citizenship, index) => index > 0 && citizenships[index - 1] >= citizenship)) {
		problems.push(`${what}: write the citizenships sorted, each once`);
	}
	return problems;
}
