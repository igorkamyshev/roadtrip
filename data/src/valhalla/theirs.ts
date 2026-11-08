// Valhalla's side of each start point, computed once and kept in the work directory, so a later run only recomputes
// ours: the cities with its travel times (`valhalla/<point>.json`), and its contours of each ring
// (`valhalla/<point>-<N>.geojson`: the contour of N − 1 hours, if any, then that of N).
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MultiPolygon } from 'engine';
import { seconds } from '../cli/input.ts';
import { field, items } from 'engine/json';
import type { City } from './cities.ts';
import type { StartPoint } from './places.ts';
import { prepareValhalla, type RegionFiles, type Tools } from './prepare.ts';
import { multiPolygon, withValhalla } from './valhalla.ts';

/** The rings compared, in hours. */
export const RING_HOURS = [1, 3, 6, 12];

/** A city with Valhalla's travel time to it in hours, null where it finds no way. */
type TimedCity = City & { readonly hours: number | null };

/** What asking Valhalla takes: where to keep its results, the tools, and the cities to time from a point. */
interface Ask {
	readonly work: string;
	readonly tools: Tools;
	readonly candidates: (point: StartPoint) => City[];
}

/** The file of Valhalla's contours of the ring of `hours` from the point. */
export function contourPath(work: string, point: StartPoint, hours: number): string {
	return join(work, 'valhalla', `${point.id}-${hours}.geojson`);
}

function citiesPath(work: string, point: StartPoint): string {
	return join(work, 'valhalla', `${point.id}.json`);
}

/** The points Valhalla has no results kept for. */
export function withoutValhalla(work: string, points: readonly StartPoint[]): StartPoint[] {
	return points.filter((point) => !existsSync(citiesPath(work, point)));
}

/**
 * Builds Valhalla's tiles of the region, has its service compute each point's rings and travel times to the point's
 * candidate cities, and keeps them; the tiles are deleted afterwards.
 */
export async function askValhalla(files: RegionFiles, points: readonly StartPoint[], { work, tools, candidates }: Ask): Promise<void> {
	prepareValhalla(files, tools);
	await withValhalla(files, tools, async (service) => {
		for (const point of points) {
			const started = performance.now();
			for (const hours of RING_HOURS) {
				const minutes = hours === 1 ? [50] : [50 * (hours - 1), 50 * hours];
				writeFileSync(contourPath(work, point, hours), featureCollection(await service.isochrones(point, minutes)));
			}
			const cities = candidates(point);
			const travel = await service.travelHours(point, cities);
			const timed: TimedCity[] = cities.map((city, at) => ({ ...city, hours: Number.isFinite(travel[at]) ? travel[at] : null }));
			writeFileSync(citiesPath(work, point), JSON.stringify({ cities: timed }));
			tools.log(`${point.id}: Valhalla in ${seconds(started)}, ${cities.length} cities`);
		}
	});
	rmSync(files.tiles, { recursive: true, force: true });
}

/** The cities with Valhalla's travel times from the point, as kept. */
export function valhallaCities(work: string, point: StartPoint): TimedCity[] {
	const path = citiesPath(work, point);
	return items(field(JSON.parse(readFileSync(path, 'utf8')), 'cities'), `the cities of ${path}`).map((city) => {
		const [id, name, lat, lon, hours] = ['id', 'name', 'lat', 'lon', 'hours'].map((key) => field(city, key));
		if (typeof id !== 'number' || typeof name !== 'string' || typeof lat !== 'number' || typeof lon !== 'number') {
			throw new TypeError(`${path} has a city without its id, name and place`);
		}
		if (hours !== null && typeof hours !== 'number') {
			throw new TypeError(`${path} has a city whose hours are no number`);
		}
		return { id, name, lat, lon, hours };
	});
}

/** The contours kept in a file of `featureCollection`. */
export function readContours(path: string): MultiPolygon[] {
	return items(field(JSON.parse(readFileSync(path, 'utf8')), 'features'), `the features of ${path}`).map((feature) =>
		multiPolygon(field(feature, 'geometry')),
	);
}

/** GeoJSON of the geometries, a feature each. */
export function featureCollection(geometries: readonly unknown[]): string {
	return JSON.stringify({
		type: 'FeatureCollection',
		features: geometries.map((geometry) => ({ type: 'Feature', geometry, properties: {} })),
	});
}
