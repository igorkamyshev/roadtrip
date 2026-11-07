// The screen's state in the link (spec «Состояние, ссылка и память браузера»):
// `/#/?p=44.81760,20.45730&h=3&cit=RUS,SRB&visas=SCHENGEN`. The router keeps it after `#` (hash history), parses it
// with `parseSearch` and checks it with `validateSearch`; every change is a `navigate` with `replace: true`.
import { HELD_VISAS } from 'rules/held-visas';
import { SHERPA_PASSPORTS } from 'rules/passports';
import { pointFromText, pointText, type Point } from './point.ts';

/** The link's parameters once checked: an absent or invalid one is left out, and the screen takes its default. */
export interface ScreenSearch {
	/** The origin, `lat,lon` to 5 decimals. */
	readonly p?: string;
	/** N, the hours of the ring: 1–12. */
	readonly h?: number;
	/** The citizenships: Sherpa's passports, alpha-3, sorted, comma-separated. */
	readonly cit?: string;
	/** The held visas: `SCHENGEN` and alpha-3 outside Schengen (rules' `HELD_VISAS`), sorted, comma-separated. */
	readonly visas?: string;
}

/**
 * The screen's state with the defaults in place: no origin until one is set, N = 1, Russian citizenship, no held
 * visas.
 */
export interface ScreenState {
	readonly origin: Point | undefined;
	readonly hours: number;
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted; none by default. */
	readonly visas: readonly string[];
}

export const DEFAULT_HOURS = 1;
export const MIN_HOURS = 1;
export const MAX_HOURS = 12;
export const DEFAULT_CITIZENSHIPS: readonly string[] = ['RUS'];
const NO_VISAS: readonly string[] = [];

/** The parameters that make up the state: a link with any of them carries a state. */
export const STATE_PARAMS: readonly string[] = ['p', 'h', 'cit', 'visas'];

const HOURS_TEXT = /^\d{1,2}$/u;
const PASSPORTS: ReadonlySet<string> = new Set(SHERPA_PASSPORTS);
const VISAS: ReadonlySet<string> = new Set(HELD_VISAS);

/** `validateSearch` of the screen's route: keeps the valid parameters, drops the rest. */
export function validateScreenSearch(raw: Record<string, unknown>): ScreenSearch {
	const origin = typeof raw.p === 'string' ? pointFromText(raw.p) : undefined;
	const hours = typeof raw.h === 'string' && HOURS_TEXT.test(raw.h) ? Number(raw.h) : typeof raw.h === 'number' ? raw.h : undefined;
	const citizenships = typeof raw.cit === 'string' ? codesFromText(raw.cit, PASSPORTS) : undefined;
	const visas = typeof raw.visas === 'string' && raw.visas !== '' ? codesFromText(raw.visas, VISAS) : undefined;
	return {
		...(origin === undefined ? {} : { p: pointText(origin) }),
		...(hours !== undefined && Number.isInteger(hours) && hours >= MIN_HOURS && hours <= MAX_HOURS ? { h: hours } : {}),
		...(citizenships === undefined ? {} : { cit: citizenships.join(',') }),
		...(visas === undefined ? {} : { visas: visas.join(',') }),
	};
}

/**
 * The codes of `RUS,SRB` (the citizenships, Sherpa's passports) or `GEO,SCHENGEN` (the held visas), sorted and once
 * each; undefined unless every one is `valid`: then the parameter takes its default.
 */
function codesFromText(text: string, valid: ReadonlySet<string>): string[] | undefined {
	const codes = text.split(',');
	return codes.every((code) => valid.has(code)) ? [...new Set(codes)].sort() : undefined;
}

export function stateFromSearch(search: ScreenSearch): ScreenState {
	return {
		origin: search.p === undefined ? undefined : pointFromText(search.p),
		hours: search.h ?? DEFAULT_HOURS,
		citizenships: search.cit === undefined ? DEFAULT_CITIZENSHIPS : search.cit.split(','),
		visas: search.visas === undefined ? NO_VISAS : search.visas.split(','),
	};
}

/**
 * The whole state as the link writes it, defaults included, so that a shared link says everything; the held visas
 * only when there are some: a link with a state and no `visas` has none.
 */
export function searchFromState(state: ScreenState): ScreenSearch {
	return {
		...(state.origin === undefined ? {} : { p: pointText(state.origin) }),
		h: state.hours,
		cit: state.citizenships.join(','),
		...(state.visas.length === 0 ? {} : { visas: state.visas.join(',') }),
	};
}

/**
 * The router's `parseSearch`: every value stays the text it is in the link. (The router's default would read
 * `h=3` as JSON.) Takes `?a=1&b=2` or `a=1&b=2`.
 */
export function parseSearch(text: string): Record<string, string> {
	return Object.fromEntries(new URLSearchParams(text.startsWith('?') ? text.slice(1) : text));
}

/**
 * The router's `stringifySearch`: `?p=44.81760,20.45730&h=3`, commas left as they are (the router's default would
 * write them as `%2C` and wrap texts in JSON). Absent values are left out.
 */
export function stringifySearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [name, value] of Object.entries(search)) {
		if (value !== undefined && value !== null) {
			params.set(name, String(value));
		}
	}
	const text = params.toString().replaceAll('%2C', ',');
	return text === '' ? '' : `?${text}`;
}
