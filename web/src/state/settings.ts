// Citizenships and held visas: what besides the origin and N decides a ring. Both are the screen's state (the link
// and the saved snapshot).
import type { ScreenState } from './search.ts';

export interface Settings {
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted. */
	readonly visas: readonly string[];
}

/** The settings of the screen's state. */
export function settingsOf(state: Pick<ScreenState, 'citizenships' | 'visas'>): Settings {
	return { citizenships: state.citizenships, visas: state.visas };
}
