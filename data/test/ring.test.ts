// The engine's seam (spec «Решения по тестам», seam 1): graph, border table, origin, N and closed countries in,
// the result out. The graphs are built from the OSM files in fixtures/ by the same builder as the world's, so
// these tests check the builder too. Expected values are worked out by hand in each fixture's header.
import { computeRing, type RingRequest } from 'engine';
import { borderTable } from 'rules';
import { describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixture-graph.ts';
import { ringContains } from './ring-contains.ts';

const straightRoad = fixtureGraph('straight-road.osm');
const twoCountries = fixtureGraph('two-countries.osm');

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

describe('an origin off the road', () => {
	it('reaches the road in a straight line at 30 km/h of driving', () => {
		// 15 km north of the road's west end: 0.5 h at the wheel, 0.6 h of travel, then 0.222 h per 0.1° of road.
		const result = computeRing(straightRoad, borderTable, request(0.135, 0, 2));

		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0, 0.15)).toBe(false); // 0.93 h
		expect(inRing(0, 0.2)).toBe(true); // 1.04 h
		expect(inRing(0, 0.6)).toBe(true); // 1.93 h
		expect(inRing(0, 0.7)).toBe(false); // 2.16 h
	});

	it('on land snaps to a road of its own country, though another country’s is nearer', () => {
		// 18.9 km from AAA's road: 0.76 h of travel.
		const result = computeRing(twoCountries, borderTable, request(0.5, 0.97, 1));

		expect(result).toMatchObject({ outcome: 'ring', startCountry: 'AAA' });
		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.5, 0.8)).toBe(true);
		expect(inRing(0.5, 1.1)).toBe(false);
	});

	it('at sea snaps to the nearest road of any country, which is the start country', () => {
		// 27.8 km north of BBB's road: 1.11 h of travel to its north end, 1.33 h to 0.7°N.
		const result = computeRing(twoCountries, borderTable, request(1.05, 1.1, 2));

		expect(result).toMatchObject({ outcome: 'ring', startCountry: 'BBB' });
		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.7, 1.1)).toBe(true);
		expect(inRing(0.5, 0.8)).toBe(false);
	});

	it('has a road within 50 km', () => {
		// 48.9 km north of the road.
		expect(computeRing(straightRoad, borderTable, request(0.44, 1, 3))).toMatchObject({ outcome: 'ring', startCountry: 'AAA' });
	});

	it('has no roads beyond 50 km', () => {
		// 51.1 km north of the road.
		expect(computeRing(straightRoad, borderTable, request(0.46, 1, 3))).toMatchObject({ outcome: 'no_roads', startCountry: 'AAA' });
	});
});

describe('a ring past the end of the roads', () => {
	it('is empty, with the longest travel time rounded up: driving time × 1.2', () => {
		// The whole road: 3.71 h at the wheel, 4.45 h of travel.
		expect(computeRing(straightRoad, borderTable, request(0, 0, 6))).toMatchObject({ outcome: 'empty', maxHours: 5 });
	});
});
