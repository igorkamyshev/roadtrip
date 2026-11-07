// The metrics of the comparison with Valhalla (spec «Решения по тестам», «Сверка с Valhalla»).
import { EARTH_RADIUS_M } from 'engine/geo';
import type { MultiPolygon } from 'engine';

const RADIANS = Math.PI / 180;

/**
 * The area of a GeoJSON MultiPolygon on the sphere, in km²: each polygon's outer ring less its holes, whatever
 * way the rings run. Edges are straight in lon/lat, as the contours of both engines are drawn.
 */
export function areaKm2(multiPolygon: MultiPolygon): number {
	let area = 0;
	for (const [outer, ...holes] of multiPolygon.coordinates) {
		area += Math.abs(ringArea(outer)) - holes.reduce((sum, hole) => sum + Math.abs(ringArea(hole)), 0);
	}
	return area;
}

/**
 * The area within a contour's outer rings, its holes filled, in km²: how far the contour reaches. A ring of N
 * hours is compared by the envelopes of N and N − 1 hours, as research/cloudflare-routing measured Valhalla's
 * isochrones when it set the tolerance. Valhalla paints only the ~500 m cells its roads cross, so the holes of
 * its contours are the cells between roads, a matter of road density and cell size rather than of reach.
 */
export function envelopeKm2(multiPolygon: MultiPolygon): number {
	return multiPolygon.coordinates.reduce((sum, [outer]) => sum + Math.abs(ringArea(outer)), 0);
}

/** The tolerance of the comparison (ADR 0001): ±10 % of Valhalla's value. */
export const TOLERANCE = 0.1;

export interface Verdict {
	/** (ours − Valhalla's) / Valhalla's. */
	readonly deviation: number;
	readonly fits: boolean;
}

export function verdict(ours: number, valhalla: number): Verdict {
	const deviation = ours === valhalla ? 0 : (ours - valhalla) / valhalla;
	// The bounds fit: no float error may push 10 % out.
	return { deviation, fits: Math.abs(deviation) <= TOLERANCE + 1e-9 };
}

/** A ring's area and the envelope of its N hours, km². */
export interface RingArea {
	readonly ringKm2: number;
	readonly envelopeKm2: number;
}

/**
 * Below this share of the envelope of N hours a ring is the edge of the extract, not a ring: everything the
 * extract holds is reached before N − 1 hours. An uncut ring of 12 h holds some 16 % of its envelope.
 */
const EMPTY_SHARE = 0.02;

/** The verdict on a ring's area; a ring empty in both engines fits, and has no deviation to speak of. */
export function ringVerdict(ours: RingArea, valhalla: RingArea): Verdict & { readonly empty: boolean } {
	const empty = (ring: RingArea) => ring.ringKm2 < EMPTY_SHARE * ring.envelopeKm2;
	if (empty(ours) && empty(valhalla)) {
		return { empty: true, deviation: 0, fits: true };
	}
	return { empty: false, ...verdict(ours.ringKm2, valhalla.ringKm2) };
}

/** A city's travel time from the origin by each engine, in hours; Infinity when the engine does not reach it. */
export interface CityTimes {
	readonly ours: number;
	readonly valhalla: number;
}

export interface CityMedians {
	/** How many cities either engine reaches within N hours. */
	readonly cities: number;
	/** The median of each engine's travel times to those cities, in hours. */
	readonly ours: number;
	readonly valhalla: number;
}

/**
 * The median travel time to the cities either engine reaches within `hours`, by each engine. Taking the cities
 * of both keeps the measure fair: an engine that is too slow loses cities to Infinity, one too fast gains them.
 * Undefined when neither engine reaches a city.
 */
export function cityMedians(cities: readonly CityTimes[], hours: number): CityMedians | undefined {
	const reached = cities.filter((city) => city.ours <= hours || city.valhalla <= hours);
	if (reached.length === 0) {
		return undefined;
	}
	return {
		cities: reached.length,
		ours: median(reached.map((city) => city.ours)),
		valhalla: median(reached.map((city) => city.valhalla)),
	};
}

function median(values: number[]): number {
	const sorted = values.toSorted((one, two) => one - two);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Signed area of a closed lon/lat ring in km² (Chamberlain & Duquette, «Some algorithms for polygons on a
 * sphere»): R²/2 × Σ (λ[i+1] − λ[i−1]) × sin φ[i]. Exact for rectangles of meridians and parallels.
 */
function ringArea(ring: readonly number[][]): number {
	const count = ring.length - 1;
	let sum = 0;
	for (let index = 0; index < count; index++) {
		const before = ring[(index + count - 1) % count];
		const after = ring[(index + 1) % count];
		sum += (after[0] - before[0]) * RADIANS * Math.sin(ring[index][1] * RADIANS);
	}
	return ((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2) * 1e-6;
}
