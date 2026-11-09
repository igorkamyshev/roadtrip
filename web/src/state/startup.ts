// Which state the screen opens with (spec #20 «Состояние, ссылка и память браузера», «При загрузке»): the link's if
// its `#…` carries one, else the one saved in the browser, else the defaults. Decided once, before the router
// renders; from then on the link and the saved snapshot change together (useScreenState).
import { parseSearch, STATE_PARAMS, stringifySearch, validateScreenSearch, type ScreenSearch } from './search.ts';

const SAVED_KEY = 'roadtrip.screen';

/** Where the opening state came from. `link opened` is a load from the link with nothing saved. */
export type StartupSource = 'link' | 'saved' | 'default';

export interface Startup {
	readonly search: ScreenSearch;
	readonly source: StartupSource;
	/** Whether the browser had a saved state, whichever won. */
	readonly hadSaved: boolean;
}

/** The opening state from the link's search text (`?p=…&h=…`, the part after `#/`) and the saved snapshot. */
export function startup(linkSearch: string, saved: string | undefined): Startup {
	const link = parseSearch(linkSearch);
	const hadSaved = saved !== undefined;
	if (STATE_PARAMS.some((name) => name in link)) {
		return { search: validateScreenSearch(link), source: 'link', hadSaved };
	}
	if (saved !== undefined) {
		return { search: validateScreenSearch(parseSearch(saved)), source: 'saved', hadSaved };
	}
	return { search: {}, source: 'default', hadSaved };
}

/** The search text of a hash-history location: `#/?p=1,2&h=3` → `?p=1,2&h=3`. */
export function hashSearch(hash: string): string {
	const index = hash.indexOf('?');
	return index === -1 ? '' : hash.slice(index);
}

/** The saved snapshot, or undefined when there is none or the browser keeps no storage. */
export function readSaved(): string | undefined {
	try {
		return localStorage.getItem(SAVED_KEY) ?? undefined;
	} catch {
		return undefined;
	}
}

/** Saves the state as the link writes it. A browser that keeps no storage only loses the memory. */
export function writeSaved(search: ScreenSearch): void {
	try {
		localStorage.setItem(SAVED_KEY, stringifySearch({ ...search }));
	} catch {
		// Private mode or blocked storage: the link still holds the state.
	}
}
