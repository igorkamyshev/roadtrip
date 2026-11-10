// The screen's state in the link (spec #20 «Состояние, ссылка и память браузера»):
// `/#/?p=44.81760,20.45730&h=3&cit=RUS,SRB&visas=SCHENGEN`, or `d=2` in place of `h` for a ring of days (#83). The router keeps it after `#` (hash history), parses it
// with `parseSearch` and checks it with `validateSearch`; every change is a `navigate` with `replace: true`.
import { HELD_VISAS } from 'rules/held-visas';
import { HOURS_PER_DAY, MAX_DAYS, MAX_HOURS } from 'worker/api';
import { SHERPA_PASSPORTS } from 'rules/passports';
import { pointFromText, pointText, type LatLon } from './point.ts';
import type { Settings } from './settings.ts';

/** The link's parameters once checked: an absent or invalid one is left out, and the screen takes its default. */
export interface ScreenSearch {
	/** The origin, `lat,lon` to 5 decimals. */
	readonly p?: string;
	/** N, the hours of the ring: 1–MAX_HOURS. Never with `d`. */
	readonly h?: number;
	/** D, the days of the ring: 2–MAX_DAYS (#83). Never with `h`. */
	readonly d?: number;
	/** The citizenships: Sherpa's passports, alpha-3, sorted, comma-separated. */
	readonly cit?: string;
	/** The held visas: `SCHENGEN` and the countries outside Schengen (rules' `HELD_VISAS`), sorted, comma-separated. */
	readonly visas?: string;
}

/**
 * The screen's state with the defaults in place: no origin until one is set, N = 1, Russian citizenship, no held
 * visas.
 */
export interface ScreenState {
	readonly origin: LatLon | undefined;
	/**
	 * The slider's cell by its ring's upper bound in hours (worker/api's `SLIDER_CELLS`): N for the ring of N hours,
	 * HOURS_PER_DAY·D for day D (#83).
	 */
	readonly hours: number;
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted; none by default. */
	readonly visas: readonly string[];
}

const DEFAULT_HOURS = 1;
const DEFAULT_CITIZENSHIPS: readonly string[] = ['RUS'];
const NO_VISAS: readonly string[] = [];

/** The parameters that make up the state: a link with any of them carries a state. */
export const STATE_PARAMS: readonly string[] = ['p', 'h', 'd', 'cit', 'visas'];

const WHOLE_TEXT = /^\d{1,2}$/u;
const PASSPORTS: ReadonlySet<string> = new Set(SHERPA_PASSPORTS);
const VISAS: ReadonlySet<string> = new Set(HELD_VISAS);

/** `validateSearch` of the screen's route: keeps the valid parameters, drops the rest. */
export function validateScreenSearch(raw: Record<string, unknown>): ScreenSearch {
	const origin = typeof raw.p === 'string' ? pointFromText(raw.p) : undefined;
	const citizenships = typeof raw.cit === 'string' ? codesFromText(raw.cit, PASSPORTS) : undefined;
	const visas = typeof raw.visas === 'string' && raw.visas !== '' ? codesFromText(raw.visas, VISAS) : undefined;
	return {
		...(origin === undefined ? {} : { p: pointText(origin) }),
		...ringFromRaw(raw),
		...(citizenships === undefined ? {} : { cit: citizenships.join(',') }),
		...(visas === undefined ? {} : { visas: visas.join(',') }),
	};
}

/** The link's `h` or `d`; neither when it has both, or one off the scale: the ring takes its default. */
function ringFromRaw(raw: Record<string, unknown>): Pick<ScreenSearch, 'h' | 'd'> {
	if (raw.h !== undefined && raw.d !== undefined) {
		return {};
	}
	const hours = wholeFromRaw(raw.h, 1, MAX_HOURS);
	const days = wholeFromRaw(raw.d, 2, MAX_DAYS);
	return hours === undefined ? (days === undefined ? {} : { d: days }) : { h: hours };
}

/** N of the link's `h` or D of its `d`, the text of a whole number or the number itself; undefined off `min`–`max`. */
function wholeFromRaw(raw: unknown, min: number, max: number): number | undefined {
	const value = typeof raw === 'string' && WHOLE_TEXT.test(raw) ? Number(raw) : raw;
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

/**
 * The codes of `RUS,SRB` (the citizenships, Sherpa's passports) or `GEO,SCHENGEN` (the held visas), sorted and once
 * each; undefined unless every one is `valid`: then the parameter takes its default.
 */
function codesFromText(text: string, valid: ReadonlySet<string>): string[] | undefined {
	const codes = text.split(',');
	return codes.every((code) => valid.has(code)) ? [...new Set(codes)].toSorted() : undefined;
}

export function stateFromSearch(search: ScreenSearch): ScreenState {
	return { origin: originFromSearch(search.p), hours: hoursFromSearch(search), ...settingsFromSearch(search.cit, search.visas) };
}

/** The origin of the link's `p`; undefined without one. */
export function originFromSearch(p: string | undefined): LatLon | undefined {
	return p === undefined ? undefined : pointFromText(p);
}

/** The slider's cell of the link's `h` or `d`: N, or HOURS_PER_DAY·D for day D; 1 h by default. */
export function hoursFromSearch({ h, d }: Pick<ScreenSearch, 'h' | 'd'>): number {
	return d === undefined ? (h ?? DEFAULT_HOURS) : HOURS_PER_DAY * d;
}

/** The citizenships of the link's `cit`, Russian by default, and the held visas of its `visas`, none by default. */
export function settingsFromSearch(cit: string | undefined, visas: string | undefined): Settings {
	return {
		citizenships: cit === undefined ? DEFAULT_CITIZENSHIPS : cit.split(','),
		visas: visas === undefined ? NO_VISAS : visas.split(','),
	};
}

/**
 * The whole state as the link writes it, defaults included, so that a shared link says everything; the held visas
 * only when there are some: a link with a state and no `visas` has none.
 */
export function searchFromState(state: ScreenState): ScreenSearch {
	return {
		...(state.origin === undefined ? {} : { p: pointText(state.origin) }),
		...(state.hours > MAX_HOURS ? { d: state.hours / HOURS_PER_DAY } : { h: state.hours }),
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
 * write them as `%2C` and wrap texts in JSON). The screen's parameters are texts and N; absent values are left out.
 */
export function stringifySearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [name, value] of Object.entries(search)) {
		if (typeof value === 'string' || typeof value === 'number') {
			params.set(name, String(value));
		}
	}
	const text = params.toString().replaceAll('%2C', ',');
	return text === '' ? '' : `?${text}`;
}
