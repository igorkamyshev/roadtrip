// The zone of a point by the zone polygons: ZoneLocator (engine/src/zones.ts), which the engine asks for every
// origin, and the builder's ZoneCells over it (src/zone-cells.ts), for every road node. Coordinates in 1e-7 degrees.
import { ZoneLocator, type ZoneRings } from 'engine/graph';
import { describe, expect, it } from 'vitest';
import { ZoneCells } from '../src/zone-cells.ts';

/** Rings from [lat, lon] corners in degrees, each closed by repeating its first corner. */
function rings(...corners: [zone: number, points: [number, number][]][]): ZoneRings {
	const start = [0];
	const lat: number[] = [];
	const lon: number[] = [];
	for (const [, points] of corners) {
		for (const [pointLat, pointLon] of [...points, points[0]]) {
			lat.push(Math.round(pointLat * 1e7));
			lon.push(Math.round(pointLon * 1e7));
		}
		start.push(lat.length);
	}
	return { zone: Uint8Array.from(corners.map(([zone]) => zone)), start: Uint32Array.from(start), lat: Int32Array.from(lat), lon: Int32Array.from(lon) };
}

const square = (south: number, west: number, north: number, east: number): [number, number][] => [
	[south, west],
	[north, west],
	[north, east],
	[south, east],
];

// Zone 2 a square from 10°S 20°W to 10°N 20°E with a hole from 1.5°S 1.5°W to 1.5°N 1.5°E; zone 1 a small square
// inside the hole, from 0.5°S 0.5°W to 0.5°N 0.5°E; far away, zone 3 an island at 60°N 170°E.
const zoneRings = rings([2, square(-10, -20, 10, 20)], [2, square(-1.5, -1.5, 1.5, 1.5)], [1, square(-0.5, -0.5, 0.5, 0.5)], [3, square(60, 170, 60.2, 170.4)]);

describe.each([
	['ZoneLocator', new ZoneLocator(zoneRings)],
	["the builder's ZoneCells", new ZoneCells(new ZoneLocator(zoneRings), zoneRings)],
])('the zone of a point by %s', (_, locator) => {
	const zoneAt = (lat: number, lon: number) => locator.zoneAt(Math.round(lat * 1e7), Math.round(lon * 1e7));

	it.each([
		[9, -19, 2],
		[-9.9, 19.9, 2],
		[5, 5, 2],
		[-3, 0, 2],
		[1, 1, 0],
		[-1, -1, 0],
		[0, 0, 1],
		[0.4, -0.4, 1],
		[11, 0, 0],
		[0, 21, 0],
		[60.1, 170.2, 3],
		[60.1, 170.5, 0],
		[-60.1, -170.2, 0],
	])('at %s, %s is zone %s', (lat, lon, zone) => {
		expect(zoneAt(lat, lon)).toBe(zone);
	});

	it('is the same on the whole degrees as just off them', () => {
		for (let lat = -9; lat <= 9; lat++) {
			for (let lon = -19; lon <= 19; lon++) {
				const inner = Math.abs(lat) < 1.5 && Math.abs(lon) < 1.5;
				const expected = inner ? (Math.abs(lat) < 0.5 && Math.abs(lon) < 0.5 ? 1 : 0) : 2;
				expect([zoneAt(lat, lon), zoneAt(lat + 1e-7, lon - 1e-7)]).toEqual([expected, expected]);
			}
		}
	});
});
