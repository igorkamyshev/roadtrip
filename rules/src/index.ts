/**
 * The border table (spec «Таблица границ»): how the engine crosses a border between two zones. The engine reads
 * it on every calculation, so a change to it needs no new graph; its hash is part of the data version (engine's
 * `dataVersion`). The rows are in `border-table.ts`, their schema here, and `borderTableProblems` checks what the
 * types cannot.
 */
export { borderTable } from './border-table.ts';
export { borderTableProblems } from './check.ts';

/**
 * - `closed`: the border is closed.
 * - `no_crossing`: no road crosses it.
 * - `pedestrian_only`: only on foot.
 * - `crossings_only`: only at the table's open crossings of the pair.
 * - `no_control`: no passport control, so any road, with no border delay (or the pair's own).
 *
 * A pair without a row has passport control: a car crosses only at a border crossing, with the default delay.
 * There are no one-way borders and no rules for citizens of the pair (#13): where a border differs by
 * citizenship, the row is what a citizen of Russia gets.
 */
export type PairStatus = 'closed' | 'no_crossing' | 'pedestrian_only' | 'crossings_only' | 'no_control';

/** A crossing is open for cars, or closed to them altogether or but for people on foot. */
export type CrossingStatus = 'open' | 'closed' | 'pedestrian_only';

/** Two zone codes in alphabetical order. */
export type Pair = readonly [string, string];

interface Checked {
	/** When the row was last checked against its sources, YYYY-MM-DD. */
	readonly checked: string;
	readonly sources: readonly string[];
	readonly notes?: string;
}

/** A pair of countries whose border is not the default one. */
export interface BorderPair extends Checked {
	readonly pair: Pair;
	readonly status: PairStatus;
	/**
	 * Border delay at this pair in hours of travel time, instead of the default (`crossings_only`) or of 0
	 * (`no_control`).
	 */
	readonly borderHours?: number;
}

/**
 * A border crossing of the table: the whitelist of a `crossings_only` pair, a closure at one place of an open
 * pair, or a crossing where OSM has no `barrier=border_control`. A road across the pair's border is at the
 * crossing when it passes within `BORDER_CROSSING_METERS` (engine/graph) of it, and the crossing nearest to it
 * decides.
 */
export interface BorderCrossing extends Checked {
	/** A short name in lowercase latin, unique in the table. */
	readonly id: string;
	readonly pair: Pair;
	/** The names of the two sides, as `«one side» – «other side»`. */
	readonly name: string;
	/** Where the road crosses the border line, in degrees. */
	readonly lat: number;
	readonly lon: number;
	/** The OSM element at the crossing: its `barrier=border_control` node, or else the road, as `node/123`. */
	readonly osm?: string;
	readonly status: CrossingStatus;
}

/** A part of a country closed for everyone (#13): a zone of its own in the graph. */
export interface ClosedTerritory {
	/** The zone code: never an alpha-3, so it cannot be a country's. */
	readonly code: string;
	readonly name: string;
}

export interface BorderTable {
	/** Border delay at a border with passport control, in hours of travel time. */
	readonly defaultBorderHours: number;
	readonly pairs: readonly BorderPair[];
	readonly crossings: readonly BorderCrossing[];
	/** Countries closed for everyone, whatever the citizenship and visas, transit included (#13). */
	readonly closedForEveryone: readonly string[];
	/** The closed territories, closed for everyone like the countries above. */
	readonly closedTerritories: readonly ClosedTerritory[];
	/** The Schengen area as the engine sees it: no border delay between two of these, on any road. */
	readonly schengen: readonly string[];
}
