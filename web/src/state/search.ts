// The screen's state in the link (spec «Состояние, ссылка и память браузера»): `/#/?p=44.81760,20.45730&h=3`.
// The router keeps it after `#` (hash history), parses it with `parseSearch` and checks it with `validateSearch`;
// every change is a `navigate` with `replace: true`. #30 adds `cit` and #31 `visas` here, with their defaults.
import { pointFromText, pointText, type Point } from './point.ts';

/** The link's parameters once checked: an absent or invalid one is left out, and the screen takes its default. */
export interface ScreenSearch {
	/** The origin, `lat,lon` to 5 decimals. */
	readonly p?: string;
	/** N, the hours of the ring: 1–12. */
	readonly h?: number;
}

/** The screen's state with the defaults in place: no origin until one is set, N = 1. */
export interface ScreenState {
	readonly origin: Point | undefined;
	readonly hours: number;
}

export const DEFAULT_HOURS = 1;
export const MIN_HOURS = 1;
export const MAX_HOURS = 12;

/** The parameters that make up the state: a link with any of them carries a state. */
export const STATE_PARAMS: readonly string[] = ['p', 'h'];

const HOURS_TEXT = /^\d{1,2}$/u;

/** `validateSearch` of the screen's route: keeps the valid parameters, drops the rest. */
export function validateScreenSearch(raw: Record<string, unknown>): ScreenSearch {
	const origin = typeof raw.p === 'string' ? pointFromText(raw.p) : undefined;
	const hours = typeof raw.h === 'string' && HOURS_TEXT.test(raw.h) ? Number(raw.h) : typeof raw.h === 'number' ? raw.h : undefined;
	return {
		...(origin === undefined ? {} : { p: pointText(origin) }),
		...(hours !== undefined && Number.isInteger(hours) && hours >= MIN_HOURS && hours <= MAX_HOURS ? { h: hours } : {}),
	};
}

export function stateFromSearch(search: ScreenSearch): ScreenState {
	return { origin: search.p === undefined ? undefined : pointFromText(search.p), hours: search.h ?? DEFAULT_HOURS };
}

/** The whole state as the link writes it, defaults included, so that a shared link says everything. */
export function searchFromState(state: ScreenState): ScreenSearch {
	return { ...(state.origin === undefined ? {} : { p: pointText(state.origin) }), h: state.hours };
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
