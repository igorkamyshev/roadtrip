// The ring engine (spec «Движок», ADR 0001): a graph, the border table, an origin, N and the closed countries
// in; the outcome, the ring, maxHours, the start country and the timings out. Portable: no Node APIs, so it
// can move to a Worker or a browser.
import type { BorderTable } from 'rules';
import { borderZones, closedForEveryone, passage } from './borders.ts';
import { ringContour } from './contour.ts';
import { E7 } from './geo.ts';
import type { Graph } from './graph.ts';
import { ZoneLocator } from './zones.ts';
import { startOnRoad } from './start.ts';
import { latestArrival, traverse } from './traverse.ts';

/**
 * The version of the engine's results. It is part of the data version in the ring cache key (spec «Кэш колец»),
 * so bump it by hand whenever the same input would give another result: see engine/AGENTS.md.
 */
export const ENGINE_VERSION = 4;

/** SHA-256 of the border table as JSON, in hex: any change to the table, a note included, changes it. */
export async function borderTableHash(table: BorderTable): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(table)));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The data version of the ring cache key (spec «Кэш колец»): the dataset's version, the first 16 hex digits of the
 * border table's hash and ENGINE_VERSION, as `2026-11-01.3f2a9c0d1e4b5a67.2`. A change to any of them puts rings
 * under new keys.
 */
export async function dataVersion(dataset: string, table: BorderTable): Promise<string> {
	return `${dataset}.${(await borderTableHash(table)).slice(0, 16)}.${ENGINE_VERSION}`;
}

export interface RingRequest {
	/** The origin in degrees, already rounded by the caller. */
	readonly origin: { readonly lat: number; readonly lon: number };
	/** N: the ring holds the places reached in (N − 1, N] hours of travel. */
	readonly hours: number;
	/**
	 * The closed countries by the visa rules, alpha-3 (spec «Набор закрытых стран»): never entered, transit
	 * included, but for the start country. Countries and territories closed for everyone are closed by the border
	 * table, whatever this holds.
	 */
	readonly closedCountries: readonly string[];
}

/** A GeoJSON MultiPolygon: polygons of [lon, lat] rings, the outer ring first, then its holes. */
export interface MultiPolygon {
	readonly type: 'MultiPolygon';
	readonly coordinates: number[][][][];
}

export interface RingTimings {
	/** Snapping the origin to a road and the traversal, in ms. */
	readonly traversalMs: number;
	/** Building the ring's contour, in ms. */
	readonly contourMs: number;
}

interface Outcome {
	/**
	 * The zone of the origin, or for an origin in no zone's polygon (at sea, the West Bank), the zone the road it is
	 * snapped to counts as at a border (`borderZones`); null when it has none.
	 */
	readonly startCountry: string | null;
	readonly timings: RingTimings;
}

export type RingResult =
	| (Outcome & { readonly outcome: 'ring'; readonly ring: MultiPolygon })
	/** Nothing is reached after N − 1 hours; `maxHours` is the longest travel time to any road, rounded up. */
	| (Outcome & { readonly outcome: 'empty'; readonly maxHours: number })
	/** No road within 50 km of the origin, in the start country. */
	| (Outcome & { readonly outcome: 'no_roads' })
	/** The start country is closed for everyone, or the origin is in a closed territory: no ring from here. */
	| (Outcome & { readonly outcome: 'no_ring' });

const locators = new WeakMap<Graph, ZoneLocator>();

function zoneLocator(graph: Graph): ZoneLocator {
	let locator = locators.get(graph);
	if (locator === undefined) {
		locator = new ZoneLocator(graph.zoneRings);
		locators.set(graph, locator);
	}
	return locator;
}

export function computeRing(graph: Graph, borderTable: BorderTable, request: RingRequest): RingResult {
	const started = performance.now();
	const lat = Math.round(request.origin.lat * E7);
	const lon = Math.round(request.origin.lon * E7);
	const originZone = zoneLocator(graph).zoneAt(lat, lon);
	const closed = closedForEveryone(graph, borderTable);
	if (closed[originZone]) {
		return { outcome: 'no_ring', startCountry: zoneCode(graph, originZone), timings: since(started, started) };
	}
	// On land the origin snaps to a road of its own zone; at sea, to any road.
	const start = startOnRoad(graph, lat, lon, originZone === 0 ? undefined : originZone);
	if (start === undefined) {
		return { outcome: 'no_roads', startCountry: zoneCode(graph, originZone), timings: since(started, started) };
	}
	const { snap } = start;
	const startZone = originZone !== 0 ? originZone : borderZones(graph)[snap.fraction < 0.5 ? snap.a : snap.b];
	if (closed[startZone]) {
		return { outcome: 'no_ring', startCountry: zoneCode(graph, startZone), timings: since(started, started) };
	}

	const allowed = passage(graph, borderTable, request.closedCountries, startZone);
	const traversal = traverse(graph, allowed, start.seeds, request.hours * 3600);
	const traversed = performance.now();
	const startCountry = zoneCode(graph, startZone);

	if (traversal.exhausted) {
		const latestHours = latestArrival(graph, traversal, start) / 3600;
		if (latestHours <= request.hours - 1) {
			return { outcome: 'empty', maxHours: Math.ceil(latestHours - 1e-9), startCountry, timings: since(started, traversed) };
		}
	}
	const ring = ringContour(
		graph,
		allowed,
		zoneLocator(graph),
		{ ...start, seconds: traversal.seconds },
		(request.hours - 1) * 3600,
		request.hours * 3600,
	);
	return { outcome: 'ring', ring, startCountry, timings: since(started, traversed) };
}

function zoneCode(graph: Graph, zone: number): string | null {
	return zone === 0 ? null : graph.zones[zone];
}

function since(started: number, traversed: number): RingTimings {
	return { traversalMs: traversed - started, contourMs: performance.now() - traversed };
}
