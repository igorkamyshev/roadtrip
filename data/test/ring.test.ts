// The engine's seam (spec «Решения по тестам», seam 1): graph, border table, origin, N and closed countries in,
// the result out. The graphs are built from the OSM files in fixtures/ by the same builder as the world's, so
// these tests check the builder too. Expected values are worked out by hand in each fixture's header.
import { computeRing, type RingRequest } from 'engine';
import { borderTable } from 'rules';
import { describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixture-graph.ts';
import { ringContains } from './ring-contains.ts';

const straightRoad = fixtureGraph('straight-road.osm');

function request(lat: number, lon: number, hours: number): RingRequest {
	return { origin: { lat, lon }, hours, closedCountries: [] };
}

describe('a ring', () => {
	it('holds the points reached in (N − 1, N] hours of travel and no others', () => {
		const result = computeRing(straightRoad, borderTable, request(0, 0, 2));

		expect(result.outcome).toBe('ring');
		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		// Along the road, 0.222 h of travel per 0.1°.
		expect(inRing(0, 0.3)).toBe(false); // 0.67 h
		expect(inRing(0, 0.6)).toBe(true); // 1.33 h
		expect(inRing(0, 0.8)).toBe(true); // 1.78 h
		expect(inRing(0, 1.0)).toBe(false); // 2.22 h
	});

	it('holds the land next to a reached road but not the land far from it', () => {
		const result = computeRing(straightRoad, borderTable, request(0, 0, 2));

		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.01, 0.7)).toBe(true); // 1.1 km north of the road
		expect(inRing(0.1, 0.7)).toBe(false); // 11 km north of it
	});
});

describe('a ring past the end of the roads', () => {
	it('is empty, with the longest travel time rounded up: driving time × 1.2', () => {
		// The whole road: 3.71 h at the wheel, 4.45 h of travel.
		expect(computeRing(straightRoad, borderTable, request(0, 0, 6))).toMatchObject({ outcome: 'empty', maxHours: 5 });
	});
});
