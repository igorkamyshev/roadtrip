// The query of GET /api/ring (api.ts, `RingQuery`) and why a query is not one: the answer 400.
import { HELD_VISAS, SHERPA_PASSPORTS } from 'rules';
import type { RingQuery } from './api.ts';

const DEGREES = /^-?\d{1,3}(\.\d+)?$/u;
const HOURS = /^\d{1,2}$/u;
const PASSPORTS: ReadonlySet<string> = new Set(SHERPA_PASSPORTS);
const VISAS: ReadonlySet<string> = new Set(HELD_VISAS);

/**
 * The query, or what is wrong with it. A citizenship is one of Sherpa's passports; a held visa is `SCHENGEN` or a
 * country outside Schengen (rules' `HELD_VISAS`).
 */
export function parseRingQuery(params: URLSearchParams): RingQuery | { readonly problem: string } {
	const single = (name: string): string | undefined => {
		const values = params.getAll(name);
		return values.length === 1 ? values[0] : undefined;
	};
	const lat = degrees(single('lat'), 90);
	const lon = degrees(single('lon'), 180);
	if (lat === undefined || lon === undefined) {
		return { problem: 'lat and lon are the origin in degrees, as -12.345' };
	}
	const hoursText = single('hours');
	const hours = hoursText !== undefined && HOURS.test(hoursText) ? Number(hoursText) : 0;
	if (hours < 1 || hours > 12) {
		return { problem: 'hours is N, a whole number from 1 to 12' };
	}
	const citizenships = codes(single('cit'), (code) => PASSPORTS.has(code));
	if (citizenships === undefined || citizenships.length === 0) {
		return { problem: "cit is the citizenships: Sherpa's passports, alpha-3, sorted, comma-separated, at least one" };
	}
	const visas = params.has('visas') ? codes(single('visas'), (code) => VISAS.has(code)) : [];
	if (visas === undefined) {
		return { problem: 'visas is the held visas: SCHENGEN and alpha-3 of countries outside Schengen, sorted, comma-separated' };
	}
	return { origin: { lat, lon }, hours, citizenships, visas };
}

function degrees(text: string | undefined, limit: number): number | undefined {
	if (text === undefined || !DEGREES.test(text)) {
		return undefined;
	}
	const value = Number(text);
	return Math.abs(value) <= limit ? value : undefined;
}

/** A comma-separated list of codes in strictly ascending order; [] for an empty text. */
function codes(text: string | undefined, valid: (code: string) => boolean): string[] | undefined {
	if (text === undefined) {
		return undefined;
	}
	if (text === '') {
		return [];
	}
	const list = text.split(',');
	return list.every((code, index) => valid(code) && (index === 0 || list[index - 1] < code)) ? list : undefined;
}
