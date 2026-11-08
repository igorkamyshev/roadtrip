// Citizenships and held visas: what besides the origin and N decides a ring. Both are the screen's state (the link
// and the saved snapshot); `useScreenState` gives them as one object.

export interface Settings {
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted. */
	readonly visas: readonly string[];
}
