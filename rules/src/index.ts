/**
 * The border table (spec «Таблица границ»): how the engine crosses a border between two zones. The engine
 * reads it on every calculation, so a change to it needs no new graph.
 *
 * Only the default border delay so far: the pairs, border crossings, countries closed for everyone,
 * Schengen and their schema and check come with the borders ticket (#23).
 */
export interface BorderTable {
	/** Border delay at a border with passport control, in hours of travel time. */
	readonly defaultBorderHours: number;
}

export const borderTable: BorderTable = {
	defaultBorderHours: 1.5,
};
