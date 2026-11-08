// A start point compared: our rings and travel times to cities against what Valhalla gave for it (theirs.ts), by the
// measures of metrics.ts.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MultiPolygon } from 'engine';
import { areaKm2, cityMedians, envelopeKm2, type RingArea, ringVerdict, verdict } from './metrics.ts';
import { ourRing, type OurRoads } from './ours.ts';
import type { StartPoint } from './places.ts';
import { ourReach } from './reach.ts';
import type { PointComparison } from './report.ts';
import { contourPath, featureCollection, readContours, RING_HOURS, valhallaCities } from './theirs.ts';

/** Our times to cities are counted up to this, so that a city Valhalla reaches in 12 h has ours too. */
const OUR_LIMIT_HOURS = 15;

/** Our engine on the region's roads against Valhalla's results kept for the point in `work`. */
export function comparePoint(point: StartPoint, roads: OurRoads, work: string): PointComparison {
	const valhalla = valhallaCities(work, point);
	const reach = ourReach(roads, point, OUR_LIMIT_HOURS);
	if (reach === undefined) {
		throw new Error(`${point.id}: no road of our graph within 50 km`);
	}
	checkSameAsComputeRing(roads, point, reach.isochrone(1));
	const ours = reach.travelHours(valhalla);
	const cityTimes = valhalla.map((city, at) => ({ ours: ours[at], valhalla: city.hours ?? Infinity }));
	const rings = RING_HOURS.map((hours) => {
		const isochrones = (hours === 1 ? [1] : [hours - 1, hours]).map((within) => reach.isochrone(within));
		writeFileSync(join(work, 'valhalla', `${point.id}-${hours}-ours.geojson`), featureCollection(isochrones));
		const oursArea = ringArea(isochrones);
		const valhallaArea = ringArea(readContours(contourPath(work, point, hours)));
		const medians = cityMedians(cityTimes, hours);
		return {
			hours,
			oursKm2: oursArea.ringKm2,
			valhallaKm2: valhallaArea.ringKm2,
			area: ringVerdict(oursArea, valhallaArea),
			cities: medians,
			median: medians === undefined ? undefined : verdict(medians.ours, medians.valhalla),
		};
	});
	return { point, rings };
}

/** The ring's area by envelopes, that of N hours less that of N − 1, from the contours of N − 1 (if any) and N. */
function ringArea(contours: readonly MultiPolygon[]): RingArea {
	const [inner, outer] = contours.length === 1 ? [undefined, contours[0]] : contours;
	const envelope = envelopeKm2(outer);
	return { ringKm2: envelope - (inner === undefined ? 0 : envelopeKm2(inner)), envelopeKm2: envelope };
}

/** Our isochrones start as computeRing starts: the 1 h one is the engine's ring of (0, 1] itself. */
function checkSameAsComputeRing({ graph }: OurRoads, point: StartPoint, isochrone: MultiPolygon): void {
	const ring = ourRing(graph, point, 1);
	const [ringKm2, isochroneKm2] = [ring === undefined ? 0 : areaKm2(ring), areaKm2(isochrone)];
	if (Math.abs(ringKm2 - isochroneKm2) > 1e-6 * Math.max(1, ringKm2)) {
		throw new Error(`${point.id}: our 1 h isochrone (${isochroneKm2} km²) is not computeRing's ring (${ringKm2} km²)`);
	}
}
