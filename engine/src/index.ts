// The ring engine (spec «Движок», ADR 0001): a graph, the border table, an origin, N and the closed countries
// in; the outcome, the ring, maxHours, the start country and the timings out. Portable: no Node APIs, so it
// can move to a Worker or a browser.
import type { BorderTable } from 'rules';
import { OFF_ROAD_SECONDS_PER_METER, ringContour } from './contour.ts';
import { E7 } from './geo.ts';
import type { Graph } from './graph.ts';
import { ZoneLocator } from './zones.ts';
import { edgeSecondsBetween, snapToRoad } from './snap.ts';
import { latestArrival, type Seed, traverse, TRAVEL_PER_DRIVING } from './traverse.ts';

/**
 * The version of the engine's results. It is part of the data version in the ring cache key (spec «Кэш колец»),
 * so bump it by hand whenever the same input would give another result: see engine/AGENTS.md.
 */
export const ENGINE_VERSION = 1;

export interface RingRequest {
	/** The origin in degrees, already rounded by the caller. */
	readonly origin: { readonly lat: number; readonly lon: number };
	/** N: the ring holds the places reached in (N − 1, N] hours of travel. */
	readonly hours: number;
	/** The closed countries, alpha-3. Not applied yet: the borders ticket (#23) does. */
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
	/** The zone of the origin, or for an origin at sea, of the road it is snapped to; null when it has none. */
	readonly startCountry: string | null;
	readonly timings: RingTimings;
}

export type RingResult =
	| (Outcome & { readonly outcome: 'ring'; readonly ring: MultiPolygon })
	/** Nothing is reached after N − 1 hours; `maxHours` is the longest travel time to any road, rounded up. */
	| (Outcome & { readonly outcome: 'empty'; readonly maxHours: number })
	/** No road within 50 km of the origin, in the start country. */
	| (Outcome & { readonly outcome: 'no_roads' });

const locators = new WeakMap<Graph, ZoneLocator>();

function zoneLocator(graph: Graph): ZoneLocator {
	let locator = locators.get(graph);
	if (locator === undefined) {
		locator = new ZoneLocator(graph.zoneRings);
		locators.set(graph, locator);
	}
	return locator;
}

export function computeRing(graph: Graph, _borderTable: BorderTable, request: RingRequest): RingResult {
	const started = performance.now();
	const lat = Math.round(request.origin.lat * E7);
	const lon = Math.round(request.origin.lon * E7);
	const originZone = zoneLocator(graph).zoneAt(lat, lon);
	// On land the origin snaps to a road of its own zone; at sea, to any road.
	const snap = snapToRoad(graph, lat, lon, originZone === 0 ? undefined : originZone);
	if (snap === undefined) {
		return { outcome: 'no_roads', startCountry: zoneCode(graph, originZone), timings: since(started, started) };
	}
	const startZone = originZone !== 0 ? originZone : graph.nodeZone[snap.fraction < 0.5 ? snap.a : snap.b];

	// The origin reaches the road in a straight line at 30 km/h of driving.
	const accessSeconds = snap.meters * OFF_ROAD_SECONDS_PER_METER;
	const seeds: Seed[] = [];
	const forward = edgeSecondsBetween(graph, snap.a, snap.b);
	if (forward >= 0) {
		seeds.push({ node: snap.b, seconds: accessSeconds + (1 - snap.fraction) * forward * TRAVEL_PER_DRIVING });
	}
	const back = edgeSecondsBetween(graph, snap.b, snap.a);
	if (back >= 0) {
		seeds.push({ node: snap.a, seconds: accessSeconds + snap.fraction * back * TRAVEL_PER_DRIVING });
	}
	const traversal = traverse(graph, seeds, request.hours * 3600);
	const traversed = performance.now();
	const startCountry = zoneCode(graph, startZone);

	if (traversal.exhausted) {
		const latestHours = latestArrival(graph, traversal) / 3600;
		if (latestHours <= request.hours - 1) {
			return { outcome: 'empty', maxHours: Math.ceil(latestHours - 1e-9), startCountry, timings: since(started, traversed) };
		}
	}
	const ring = ringContour(
		graph,
		{ seconds: traversal.seconds, snap, accessSeconds, forwardSeconds: forward * TRAVEL_PER_DRIVING, backSeconds: back * TRAVEL_PER_DRIVING },
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
