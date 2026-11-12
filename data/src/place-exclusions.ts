// The table of exclusions of places, data/place-exclusions.tsv (#169): by Q-id, whether a place is `out`, its item
// being of something other than the object of OSM that names it (a class, a village, a district, a road, a
// disambiguation page), or `keep`, a place checked and kept. Wikidata finds the places to decide on (`doubts` of
// src/wikidata.ts), but its classes are noisy (ADR 0003), so the table decides. The deploy takes the places it puts
// out from the places file R2 holds (`withoutExcludedPlaces`), so an edit of it goes live with the next deploy, with
// no new dataset; the build of the places file leaves them out too and reports the places in doubt it has no word on.
import { join } from 'node:path';
import { type Place, type PlaceRow, type PlacesFile, type PlaceType, QID } from './places-file.ts';
import { readTable, type TableShape } from './tables.ts';
import type { PlaceDoubt, WikidataPlace } from './wikidata.ts';

/** A decision of the table: the place is out of the file, or checked and kept. */
export type PlaceDecision = 'out' | 'keep';

const EXCLUSIONS_TABLE: TableShape = {
	shipped: join(import.meta.dirname, '../place-exclusions.tsv'),
	header: 'qid\tname\tdecision',
	key: QID,
	keyIs: 'Q and a positive integer',
	value: /^(?:out|keep)$/u,
	badValue: 'the decision is not out or keep',
};

/** How many of the places in doubt that the table has no word on the report names. */
const MOST_FAMOUS_UNDECIDED = 10;

/** The table at `path`, the shipped one by default, by Q-id as a number, checked as the tables of Russian names. */
export function readPlaceExclusions(path = EXCLUSIONS_TABLE.shipped): Map<number, PlaceDecision> {
	const decisions = new Map<number, PlaceDecision>();
	for (const [qid, decision] of readTable(path, EXCLUSIONS_TABLE)) {
		decisions.set(qid, decision === 'out' ? 'out' : 'keep');
	}
	return decisions;
}

/**
 * The places file without the places the table puts out, how many it took out, and how many of the table's `out`
 * Q-ids the file lacks. The other rows stay in their order with their columns, each Q-id's difference from the row
 * before's taken anew. The cells of the outlines stay: the screen shows only the places of the file
 * (`useRingPlaces` of web/src/places/origin.ts), so a Q-id of a cell the file lacks is shown nowhere.
 */
export function withoutExcludedPlaces(
	file: PlacesFile,
	decisions: ReadonlyMap<number, PlaceDecision>,
): { file: PlacesFile; removed: number; notInFile: number } {
	let qid = 0;
	let kept = 0;
	const places: PlaceRow[] = [];
	for (const row of file.places) {
		const [difference, ...rest] = row;
		qid += difference;
		if (decisions.get(qid) !== 'out') {
			places.push([qid - kept, ...rest]);
			kept = qid;
		}
	}
	const removed = file.places.length - places.length;
	const outs = [...decisions.values()].filter((decision) => decision === 'out').length;
	return { file: { ...file, places }, removed, notInFile: outs - removed };
}

/** A place in doubt that the table has no word on, with what a person reads to decide on it. */
export interface UndecidedPlace {
	readonly qid: number;
	/** `local`. */
	readonly name: string;
	readonly type: PlaceType;
	/** Wikidata's classes of its item (P31). */
	readonly instanceOf: readonly string[];
	readonly doubts: readonly PlaceDoubt[];
}

/** The places in doubt that the table has no word on: how many, how many of each doubt (a place may have several), and the most famous of them. */
export interface Undecided {
	readonly count: number;
	readonly byDoubt: Readonly<Record<PlaceDoubt, number>>;
	readonly mostFamous: readonly UndecidedPlace[];
}

/**
 * Of the places, the most famous first, those in doubt (`WikidataPlace.doubts`) that the table has no word on: the
 * places to add to it (data/AGENTS.md, «Places file»). They stay in the file, so a new place like Petra is not lost
 * unchecked.
 */
export function undecidedPlaces(
	places: readonly Place[],
	items: ReadonlyMap<number, WikidataPlace>,
	decisions: ReadonlyMap<number, PlaceDecision>,
): Undecided {
	const undecided = places.flatMap(({ qid, local, type }): UndecidedPlace[] => {
		const { instanceOf = [], doubts = [] } = items.get(qid) ?? {};
		return doubts.length === 0 || decisions.has(qid) ? [] : [{ qid, name: local, type, instanceOf, doubts }];
	});
	const of = (doubt: PlaceDoubt) => undecided.filter(({ doubts }) => doubts.includes(doubt)).length;
	return {
		count: undecided.length,
		byDoubt: { class: of('class'), disambiguation: of('disambiguation'), settlement: of('settlement') },
		mostFamous: undecided.slice(0, MOST_FAMOUS_UNDECIDED),
	};
}
