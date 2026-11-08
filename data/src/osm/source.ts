// What the builder reads from an OSM file, whatever its format (XML or PBF). Coordinates are integers in
// 1e-7 degrees, OSM's own precision, as in the graph.

/** An element's tags by key: a key the element lacks is undefined. */
export type Tags = Readonly<Partial<Record<string, string>>>;

export interface OsmNode {
	readonly id: number;
	readonly lat: number;
	readonly lon: number;
	readonly tags: Tags;
}

export interface OsmWay {
	readonly id: number;
	readonly refs: readonly number[];
	readonly tags: Tags;
	/**
	 * The coordinates of `refs`, when the file carries them on its ways (`osmium add-locations-to-ways`, which
	 * also drops the untagged nodes). NaN for a node the file lacks (`--ignore-missing-nodes`).
	 */
	readonly locations?: { readonly lat: readonly number[]; readonly lon: readonly number[] };
}

export interface OsmMember {
	readonly type: 'node' | 'way' | 'relation';
	readonly ref: number;
	readonly role: string;
}

export interface OsmRelation {
	readonly id: number;
	readonly members: readonly OsmMember[];
	readonly tags: Tags;
}

/** Called for each element of the file; an element type without a callback may be skipped unread. */
export interface OsmVisitor {
	readonly node?: (node: OsmNode) => void;
	readonly way?: (way: OsmWay) => void;
	readonly relation?: (relation: OsmRelation) => void;
}

/** An OSM file. The builder reads it in several passes, one element type each. */
export interface OsmSource {
	readonly read: (visitor: OsmVisitor) => void;
}
