// The zone outlines the screen hatches closed countries and territories with (spec #20 «Набор данных», «Контуры зон для
// штриховки»): the graph's zone polygons, simplified to ~2 km, as GeoJSON. What the hatching shows is the screen's
// test; here, that an outline is where the graph's zone is.
import { ZoneLocator, type Graph } from 'engine/graph';
import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/build-graph.ts';
import { openOsm } from '../src/osm/open.ts';
import { type ZoneOutlines, zoneOutlines } from '../src/outlines.ts';
import { fixturePath } from './fixture-graph.ts';

/** The zones whose outline holds (lon, lat), by the even-odd rule over all of each outline's rings. */
function outlinesAt(outlines: ZoneOutlines, lon: number, lat: number): string[] {
	return outlines.features
		.filter(({ geometry }) => {
			let inside = false;
			// The rings of every polygon.
			for (const ring of geometry.coordinates.flat()) {
				for (let point = 0, previous = ring.length - 1; point < ring.length; previous = point++) {
					const [lon1, lat1] = ring[previous];
					const [lon2, lat2] = ring[point];
					if (lat1 > lat !== lat2 > lat && lon < lon1 + ((lon2 - lon1) * (lat - lat1)) / (lat2 - lat1)) {
						inside = !inside;
					}
				}
			}
			return inside;
		})
		.map(({ properties }) => properties.zone);
}

/** A ring of `points` [lon, lat] in degrees, closed, as `ZoneRings` holds it. */
function rings(...zones: { zone: number; points: [number, number][] }[]): Graph['zoneRings'] {
	const start = [0];
	const lat: number[] = [];
	const lon: number[] = [];
	for (const { points } of zones) {
		for (const [pointLon, pointLat] of [...points, points[0]]) {
			lon.push(Math.round(pointLon * 1e7));
			lat.push(Math.round(pointLat * 1e7));
		}
		start.push(lat.length);
	}
	return {
		zone: Uint8Array.from(zones, ({ zone }) => zone),
		start: Uint32Array.from(start),
		lat: Int32Array.from(lat),
		lon: Int32Array.from(lon),
	};
}

describe('the zone outlines', () => {
	// The zones of #13 as squares of 1° along the equator (fixtures/zones.osm): parts of countries inside their
	// countries, Russia and Ukraine overlapping, Western Sahara over part of Morocco.
	const { graph, report } = buildGraph(openOsm(fixturePath('zones.osm')));
	const outlines = zoneOutlines(graph, report.parts);
	const locator = new ZoneLocator(graph.zoneRings);

	it('are one feature per zone, its code in `zone`', () => {
		expect(outlines.type).toBe('FeatureCollection');
		expect(outlines.features.map(({ properties }) => properties.zone)).toEqual([
			'ABKHAZIA',
			'CRIMEA',
			'CYP',
			'GAZA',
			'GEO',
			'MAR',
			'MDA',
			'NX',
			'RKS',
			'RUS',
			'SOUTH_OSSETIA',
			'UKR',
			'WESTERN_SAHARA',
		]);
		expect(outlines.features.map(({ type, geometry }) => [type, geometry.type])).toEqual(
			outlines.features.map(() => ['Feature', 'MultiPolygon']),
		);
	});

	it("hold every point of their zone, and a part's points only in the part's outline, as the graph locates them", () => {
		const parts = new Set(report.parts);
		const wrong: string[] = [];
		// Every 0.1° from 1°W to 22°E and 0.5°S to 1.5°N, halfway between the fixture's lines.
		for (let lon = -0.95; lon < 22; lon += 0.1) {
			for (let lat = -0.45; lat < 1.5; lat += 0.1) {
				const zone = graph.zones[locator.zoneAt(Math.round(lat * 1e7), Math.round(lon * 1e7))];
				const held = outlinesAt(outlines, lon, lat);
				const right = zone === '' ? held.length === 0 : held.includes(zone) && (!parts.has(zone) || held.length === 1);
				if (!right) {
					wrong.push(
						`${lon.toFixed(2)},${lat.toFixed(2)}: ${zone === '' ? 'none' : zone}, outlines ${held.length === 0 ? 'none' : held.join(' ')}`,
					);
				}
			}
		}
		expect(wrong).toEqual([]);
	});

	it('cut a part out of its country: Northern Cyprus out of Cyprus, Western Sahara out of the part of Morocco it covers', () => {
		expect(outlinesAt(outlines, 2.5, 0.5)).toEqual(['NX']);
		expect(outlinesAt(outlines, 3.5, 0.5)).toEqual(['CYP']);
		expect(outlinesAt(outlines, 18.5, 0.5)).toEqual(['MAR']);
		expect(outlinesAt(outlines, 19.5, 0.5)).toEqual(['WESTERN_SAHARA']);
	});

	it('simplify a boundary to ~2 km, and round to 0.001°', () => {
		// A square of 1° whose south side zigzags 1 km (0.009°) off the equator, every 0.01°; and a square of 1 km.
		const zigzag: [number, number][] = [];
		for (let step = 0; step <= 100; step++) {
			zigzag.push([step / 100, step % 2 === 0 ? 0 : -0.009]);
		}
		const simplified = zoneOutlines(
			{
				zones: ['', 'AAA', 'BBB'],
				zoneRings: rings(
					{ zone: 1, points: [...zigzag, [1, 1.0000004], [0.0000003, 1]] },
					{
						zone: 2,
						points: [
							[3, 0],
							[3.009, 0],
							[3.009, 0.009],
							[3, 0.009],
						],
					},
				),
			},
			[],
		);

		expect(simplified.features).toEqual([
			{
				type: 'Feature',
				properties: { zone: 'AAA' },
				geometry: {
					type: 'MultiPolygon',
					coordinates: [
						[
							[
								[0, 0],
								[1, 0],
								[1, 1],
								[0, 1],
								[0, 0],
							],
						],
					],
				},
			},
		]);
	});
});
