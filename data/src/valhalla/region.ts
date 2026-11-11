// A region of the comparison: our graph of its extracts, Valhalla's results for the start points that have none
// kept yet (theirs.ts), then each point compared (compare.ts).
import { haversineMeters } from 'engine/geo';
import { seconds } from '../cli/input.ts';
import type { City } from './cities.ts';
import { comparePoint } from './compare.ts';
import { RoadIndex } from '../road-index.ts';
import { graphWithoutZones } from './ours.ts';
import { type Region, START_POINTS } from './places.ts';
import { prepareRoads, type Tools } from './prepare.ts';
import type { PointComparison } from './report.ts';
import { askValhalla, withoutValhalla } from './theirs.ts';

/** A city further than this from the origin is out of any 12 h ring. */
const CITY_REACH_METERS = 1_500_000;
/** A city further than this from a road of our graph is outside the extract. */
const CITY_ROAD_METERS = 5000;

/** A run of the comparison: its work directory, the cities to time, and the tools. */
export interface Run {
	readonly work: string;
	readonly cities: readonly City[];
	readonly tools: Tools;
}

/** The comparison of each start point of the region. */
export async function compareRegion(region: Region, { work, cities, tools }: Run): Promise<PointComparison[]> {
	const started = performance.now();
	const files = await prepareRoads(work, region, tools);
	const graph = graphWithoutZones(files.roads);
	const roads = { graph, index: new RoadIndex(graph, CITY_ROAD_METERS) };
	tools.log(`${region.id}: our graph of ${graph.nodeLat.length} nodes in ${seconds(started)}`);
	const points = START_POINTS.filter((point) => point.region === region.id);
	const missing = withoutValhalla(work, points);
	if (missing.length > 0) {
		await askValhalla(files, missing, {
			work,
			tools,
			candidates: (point) =>
				cities.filter(
					(city) =>
						haversineMeters(point.lat, point.lon, city.lat, city.lon) <= CITY_REACH_METERS &&
						roads.index.nearest(city.lat, city.lon) !== undefined,
				),
		});
	}
	return points.map((point) => {
		const pointStarted = performance.now();
		const comparison = comparePoint(point, roads, work);
		tools.log(
			`${point.id} (${seconds(pointStarted)}): ` +
				comparison.rings
					.map(
						(ring) =>
							`${ring.hours} h area ${pct(ring.area.deviation)} median ${ring.median === undefined ? '—' : pct(ring.median.deviation)}`,
					)
					.join('; '),
		);
		return comparison;
	});
}

function pct(deviation: number): string {
	return `${(deviation * 100).toFixed(0)}%`;
}
