// The engine's seam (spec «Решения по тестам», seam 1): graph, border table, origin, N and closed countries in,
// the result out. The graphs are built from the OSM files in fixtures/ by the same builder as the world's, so
// these tests check the builder too. Expected values are worked out by hand in each fixture's header.
import { computeRing, type RingRequest } from 'engine';
import { type BorderCrossing, type BorderTable, borderTable, type CrossingStatus } from 'rules';
import { describe, expect, it } from 'vitest';
import { fixtureGraph } from './fixture-graph.ts';
import { ringContains } from './ring-contains.ts';
import { crossing, pair, rules } from './rules.ts';

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
		expect(inRing(0.005, 0.7)).toBe(true); // 0.6 km north of the road
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

describe('the roads of the graph', () => {
	const roads = fixtureGraph('roads.osm');
	const maxHoursFrom = (lat: number, lon: number) => {
		const result = computeRing(roads, borderTable, request(lat, lon, 12));
		return result.outcome === 'empty' ? result.maxHours : result.outcome;
	};

	it('are driven at maxspeed where it is below the speed of their class', () => {
		expect(maxHoursFrom(0, 0)).toBe(2); // primary at maxspeed=30
		expect(maxHoursFrom(0.5, 0)).toBe(2); // secondary with maxspeed=100, still at 60 km/h
		expect(maxHoursFrom(1, 0)).toBe(2); // tertiary at 20 mph
	});

	it('are motorway to tertiary, without ferries or roads closed to cars', () => {
		expect(maxHoursFrom(1.5, 0)).toBe(1); // not on to a residential road or a ferry
		expect(maxHoursFrom(3, 0)).toBe(1); // not on to a road with access=no
	});

	it('are driven one way when they are one-way, and motorways are', () => {
		expect(maxHoursFrom(2, 0.7)).toBe(1);
		expect(maxHoursFrom(2.5, 1.1)).toBe(1);
	});
});

describe('a calculation', () => {
	it('gives the same result for the same input, on a graph built again from the same file', () => {
		const { timings: _first, ...first } = computeRing(twoCountries, borderTable, request(0.5, 0.97, 2));
		const { timings: _second, ...second } = computeRing(fixtureGraph('two-countries.osm'), borderTable, request(0.5, 0.97, 2));

		expect(second).toEqual(first);
	});

	it('times the traversal and the contour', () => {
		expect(computeRing(straightRoad, borderTable, request(0, 0, 2)).timings).toEqual({
			traversalMs: expect.any(Number),
			contourMs: expect.any(Number),
		});
	});
});

describe('a border', () => {
	const borders = fixtureGraph('borders.osm');
	/** maxHours of the empty 12 h ring from the west end of road `road` of borders.osm. */
	const maxHoursOf = (road: number, table: BorderTable, closedCountries: string[] = []) => {
		const result = computeRing(borders, table, { ...request(road / 10, 0.5, 12), closedCountries });
		return result.outcome === 'empty' ? result.maxHours : result.outcome;
	};

	it('with passport control takes 1.5 h, crossed at a border crossing', () => {
		expect(maxHoursOf(2, rules())).toBe(4);
	});

	it('with passport control is not crossed where there is no border crossing', () => {
		expect(maxHoursOf(1, rules())).toBe(1);
	});

	it('with passport control is crossed at an open crossing of the table', () => {
		expect(maxHoursOf(1, rules({ crossings: [crossingOn(1, 'open')] }))).toBe(4);
	});

	it('inside Schengen takes 0 h, on any road', () => {
		expect(maxHoursOf(1, rules({ schengen: ['AAA', 'BBB'] }))).toBe(3);
		expect(maxHoursOf(2, rules({ schengen: ['AAA', 'BBB'] }))).toBe(3);
	});

	it('of a pair without passport control takes 0 h, on any road', () => {
		expect(maxHoursOf(1, rules({ pairs: [pair('no_control')] }))).toBe(3);
	});

	it('of a pair takes the pair’s own time', () => {
		expect(maxHoursOf(1, rules({ pairs: [pair('no_control', { borderHours: 2 })] }))).toBe(5);
		expect(maxHoursOf(2, rules({ pairs: [pair('crossings_only', { borderHours: 3 })], crossings: [crossingOn(2, 'open')] }))).toBe(6);
	});

	it('of a crossings_only pair is crossed only at its open crossings', () => {
		const table = rules({ pairs: [pair('crossings_only')], crossings: [crossingOn(1, 'open')] });

		expect(maxHoursOf(1, table)).toBe(4);
		expect(maxHoursOf(2, table)).toBe(1); // a checkpoint in OSM, but not in the table
	});

	it.each(['closed', 'pedestrian_only'] as const)('is not crossed at a crossing that is %s, though OSM has a checkpoint there', (status) => {
		expect(maxHoursOf(2, rules({ crossings: [crossingOn(2, status)] }))).toBe(1);
		expect(maxHoursOf(2, rules({ schengen: ['AAA', 'BBB'], crossings: [crossingOn(2, status)] }))).toBe(1);
	});

	it.each(['closed', 'no_crossing', 'pedestrian_only'] as const)('of a %s pair is not crossed, though OSM has a checkpoint', (status) => {
		expect(maxHoursOf(2, rules({ pairs: [pair(status)] }))).toBe(1);
	});

	it('is not where a road leaves every zone’s polygon: a neighbour the extract does not hold, or a gap', () => {
		expect(maxHoursOf(4, rules())).toBe(3);
	});

	it('is not crossed by an origin at sea snapping to the road across it', () => {
		// 13.3 km south of road 1's segment across AAA–BBB, 14.5 km from its first node in BBB, 1.1°E: 0.578 h of
		// travel to it, 1.245 h to 1.4°E.
		const result = computeRing(borders, rules(), request(-0.02, 1.05, 2));

		expect(result).toMatchObject({ outcome: 'ring', startCountry: 'BBB' });
		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.11, 1.4)).toBe(true);
		expect(inRing(0.11, 0.6)).toBe(false); // AAA, across the border without a crossing
	});
});

describe('a closed country', () => {
	const borders = fixtureGraph('borders.osm');

	it('lets no one through to the open country beyond it', () => {
		const from = (closedCountries: string[]) => computeRing(borders, rules(), { ...request(0.3, 0.5, 12), closedCountries });

		expect(from([])).toMatchObject({ outcome: 'empty', maxHours: 8 });
		expect(from(['BBB'])).toMatchObject({ outcome: 'empty', maxHours: 2 });
	});

	it('is open when it is the start country', () => {
		// On road 3 in BBB, west of the junction at 1.5°E.
		const from = (closedCountries: string[]) => computeRing(borders, rules(), { ...request(0.3, 1.3, 12), closedCountries });

		expect(from(['BBB'])).toMatchObject({ outcome: 'empty', maxHours: 5, startCountry: 'BBB' });
		expect(from(['AAA', 'BBB', 'CCC'])).toMatchObject({ outcome: 'empty', maxHours: 2, startCountry: 'BBB' });
	});

	it('stays out of the ring, though the land next to a reached road is in it', () => {
		// Road 3 reaches 0.995°E in AAA at 1.10 h, 0.56 km before BBB.
		const result = computeRing(borders, rules(), { ...request(0.3, 0.5, 2), closedCountries: ['BBB'] });

		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.304, 0.99)).toBe(true); // in AAA, 0.7 km from 0.995°E
		expect(inRing(0.301, 1.001)).toBe(false); // in BBB, 0.7 km from it
	});

	it('for everyone is closed though not among the closed countries', () => {
		expect(computeRing(borders, rules({ closedForEveryone: ['BBB'] }), request(0.3, 0.5, 12))).toMatchObject({ outcome: 'empty', maxHours: 2 });
	});

	it('for everyone gives no ring from inside it', () => {
		expect(computeRing(borders, rules({ closedForEveryone: ['BBB'] }), request(0.3, 1.3, 12))).toMatchObject({
			outcome: 'no_ring',
			startCountry: 'BBB',
		});
	});
});

/** A crossing of AAA–BBB where road `road` of borders.osm crosses it, at 1°E. */
function crossingOn(road: number, status: CrossingStatus): BorderCrossing {
	return crossing(`road${road}`, road / 10, 1, status);
}

describe('a closed territory', () => {
	const territory = fixtureGraph('closed-territory.osm');

	it('is not crossed, though its country is open', () => {
		expect(computeRing(territory, borderTable, request(0.5, 0.2, 12))).toMatchObject({ outcome: 'empty', maxHours: 2, startCountry: 'GEO' });
	});

	it('stays out of the ring, though the land next to a reached road is in it', () => {
		const result = computeRing(territory, borderTable, request(0.5, 0.2, 2));

		const inRing = (lat: number, lon: number) => result.outcome === 'ring' && ringContains(result.ring, lat, lon);
		expect(inRing(0.504, 0.99)).toBe(true); // in Georgia, 0.7 km from the last node before Abkhazia
		expect(inRing(0.501, 1.001)).toBe(false); // in Abkhazia, 0.7 km from it
	});

	it('gives no ring from inside it', () => {
		expect(computeRing(territory, borderTable, request(0.5, 1.2, 2))).toMatchObject({ outcome: 'no_ring', startCountry: 'ABKHAZIA' });
	});
});

describe('the zones of #13', () => {
	const zones = fixtureGraph('zones.osm');

	it.each([
		['Kosovo', 0.5, 'no_ring', 'RKS'],
		['Northern Cyprus', 2.5, 'no_roads', 'NX'],
		['Cyprus outside Northern Cyprus', 3.5, 'no_roads', 'CYP'],
		['Akrotiri and Dhekelia', 4.5, 'no_roads', 'CYP'],
		['Transnistria', 7.5, 'no_roads', 'MDA'],
		['Russia outside Ukraine', 9.5, 'no_roads', 'RUS'],
		['Crimea', 10.3, 'no_ring', 'CRIMEA'],
		['Sevastopol', 10.7, 'no_ring', 'CRIMEA'],
		['Abkhazia', 13.5, 'no_ring', 'ABKHAZIA'],
		['South Ossetia', 14.5, 'no_ring', 'SOUTH_OSSETIA'],
		['Georgia outside them', 13.9, 'no_roads', 'GEO'],
		['the Gaza Strip', 16.5, 'no_ring', 'GAZA'],
		['Morocco north of Western Sahara', 18.5, 'no_roads', 'MAR'],
		['Western Sahara west of the wall', 19.5, 'no_ring', 'WESTERN_SAHARA'],
		['Western Sahara east of the wall', 20.5, 'no_ring', 'WESTERN_SAHARA'],
	])('put an origin in %s at %s°E in its zone: %s, start country %s', (_, lon, outcome, startCountry) => {
		expect(computeRing(zones, borderTable, request(0.5, lon, 2))).toMatchObject({ outcome, startCountry });
	});
});

describe('a ring past the end of the roads', () => {
	it('is empty, with the longest travel time rounded up: driving time × 1.2', () => {
		// The whole road: 3.71 h at the wheel, 4.45 h of travel.
		expect(computeRing(straightRoad, borderTable, request(0, 0, 6))).toMatchObject({ outcome: 'empty', maxHours: 5 });
	});
});
