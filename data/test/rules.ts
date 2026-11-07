import type { BorderCrossing, BorderPair, BorderTable, CrossingStatus, PairStatus } from 'rules';

/** A border table with the rules given and no others: passport control and 1.5 h on every border. */
export function rules(given: Partial<BorderTable> = {}): BorderTable {
	return { defaultBorderHours: 1.5, pairs: [], crossings: [], closedForEveryone: [], closedTerritories: [], schengen: [], ...given };
}

/** A row of the border table for AAA–BBB. */
export function pair(status: PairStatus, extra: Partial<BorderPair> = {}): BorderPair {
	return { pair: ['AAA', 'BBB'], status, checked: '2026-11-07', sources: [], ...extra };
}

/** A crossing of AAA–BBB at the point. */
export function crossing(id: string, lat: number, lon: number, status: CrossingStatus): BorderCrossing {
	return { id, pair: ['AAA', 'BBB'], name: id, lat, lon, status, checked: '2026-11-07', sources: [] };
}
