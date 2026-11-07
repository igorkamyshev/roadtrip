// Citizenships and held visas: what besides the origin and N decides a ring. The citizenships are the screen's
// state (the link and the saved snapshot); the held visas stay none until #31 makes them state too.
import type { ScreenState } from './search.ts';

export interface Settings {
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted. */
	readonly visas: readonly string[];
}

const NO_VISAS: readonly string[] = [];

/** The settings of the screen's state. #31: the held visas from the state. */
export function settingsOf(state: Pick<ScreenState, 'citizenships'>): Settings {
	return { citizenships: state.citizenships, visas: NO_VISAS };
}
