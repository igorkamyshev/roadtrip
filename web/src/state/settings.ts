// Citizenships and held visas: what besides the origin and N decides a ring. Until the phrase lets the person
// choose them (#30 citizenships, #31 held visas, both into the link and the saved snapshot), the defaults of the
// spec («При загрузке»): Russian citizenship, no visas.

export interface Settings {
	/** Alpha-3, sorted, at least one. */
	readonly citizenships: readonly string[];
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted. */
	readonly visas: readonly string[];
}

export const DEFAULT_SETTINGS: Settings = { citizenships: ['RUS'], visas: [] };
