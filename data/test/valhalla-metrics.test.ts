// The metrics of the comparison with Valhalla (spec #20 «Решения по тестам», «Сверка с Valhalla»): ring area, the
// median travel time to cities, and the ±10 % tolerance. A lat/lon rectangle's area on the sphere is
// R² × Δλ × (sin φ2 − sin φ1), with R = 6371.0088 km; the expected areas below come from that formula.
import { describe, expect, it } from 'vitest';
import { areaKm2, cityMedians, envelopeKm2, ringVerdict, verdict } from '../src/valhalla/metrics.ts';

/** A closed counter-clockwise lon/lat rectangle between its south-west and north-east corners, [lon, lat]. */
function rectangle([west, south]: [number, number], [east, north]: [number, number]): number[][] {
	return [
		[west, south],
		[east, south],
		[east, north],
		[west, north],
		[west, south],
	];
}

describe('the area of a ring', () => {
	it('is the area on the sphere of a square degree at the equator', () => {
		expect(areaKm2({ type: 'MultiPolygon', coordinates: [[rectangle([0, 0], [1, 1])]] })).toBeCloseTo(12_363.72, 1);
	});

	it('leaves out its holes, whichever way they run', () => {
		// 12 363.72 km² less the half-degree square in its middle, 3 090.96 km².
		const hole = rectangle([0.25, 0.25], [0.75, 0.75]).toReversed();

		expect(areaKm2({ type: 'MultiPolygon', coordinates: [[rectangle([0, 0], [1, 1]), hole]] })).toBeCloseTo(9_272.76, 1);
	});
});

describe('the envelope of a contour', () => {
	it('is the area within its outer rings, holes filled, of every polygon', () => {
		// 12 363.72 km² with its hole filled, and 12 176.84 km² of two degrees by one at 60–61° N.
		const contour = {
			type: 'MultiPolygon' as const,
			coordinates: [[rectangle([0, 0], [1, 1]), rectangle([0.25, 0.25], [0.75, 0.75]).toReversed()], [rectangle([10, 60], [12, 61])]],
		};

		expect(envelopeKm2(contour)).toBeCloseTo(24_540.55, 1);
	});
});

describe('the median travel time to cities', () => {
	it('takes the cities either engine reaches within N hours, with each engine’s own times', () => {
		const cities = [
			{ ours: 1, valhalla: 1.2 },
			{ ours: 2.5, valhalla: 3.5 }, // only ours within 3 h
			{ ours: Infinity, valhalla: 2.9 }, // only Valhalla's
			{ ours: 4, valhalla: 4 }, // neither
		];

		expect(cityMedians(cities, 3)).toEqual({ cities: 3, ours: 2.5, valhalla: 2.9 });
	});

	it('of an even count is the mean of the middle two, an unreached city counting as the slowest', () => {
		const cities = [
			{ ours: 1, valhalla: 1 },
			{ ours: 2, valhalla: Infinity },
			{ ours: Infinity, valhalla: 1.5 },
			{ ours: 1.8, valhalla: 2 },
		];

		expect(cityMedians(cities, 2)).toEqual({ cities: 4, ours: 1.9, valhalla: 1.75 });
	});

	it('is none when neither engine reaches a city within N hours', () => {
		expect(cityMedians([{ ours: 1.5, valhalla: Infinity }], 1)).toBeUndefined();
	});
});

describe('the verdict', () => {
	it('fits when ours is within ±10 % of Valhalla’s, the bounds included', () => {
		expect(verdict(110, 100)).toEqual({ deviation: 0.1, fits: true });
		expect(verdict(90, 100)).toEqual({ deviation: -0.1, fits: true });
		expect(verdict(89, 100)).toEqual({ deviation: -0.11, fits: false });
		expect(verdict(Infinity, 3)).toEqual({ deviation: Infinity, fits: false });
	});
});

describe('the verdict on a ring area', () => {
	it('takes a ring under 2 % of its envelope in both engines as empty: the extract ends before N − 1 hours', () => {
		const ours = { ringKm2: 237, envelopeKm2: 120_151 };
		const valhalla = { ringKm2: 10, envelopeKm2: 120_266 };

		expect(ringVerdict(ours, valhalla)).toEqual({ empty: true, deviation: 0, fits: true });
	});

	it('compares a ring empty in one engine only', () => {
		const ours = { ringKm2: 100, envelopeKm2: 100_000 };
		const valhalla = { ringKm2: 8000, envelopeKm2: 100_000 };

		expect(ringVerdict(ours, valhalla)).toEqual({ empty: false, deviation: -0.9875, fits: false });
	});
});
