// Valhalla's side of the comparison: its rings and its travel times to cities, from its HTTP service on the
// region's tiles, with the auto costing as is. Valhalla knows driving time only: our ×1.2 is applied to its
// times, so a ring of N hours of travel lies between the contours of 50·(N − 1) and 50·N minutes at the wheel.
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import type { LatLon, MultiPolygon } from 'engine';
import { TRAVEL_PER_DRIVING } from 'engine/traverse';
import { field, items } from '../json.ts';
import type { RegionFiles, Tools } from './prepare.ts';

export interface ValhallaService {
	/** The contour of `drivingMinutes` at the wheel and of each further time given, in the same order. */
	readonly isochrones: (origin: LatLon, drivingMinutes: readonly number[]) => Promise<MultiPolygon[]>;
	/** Travel time from the origin to each target in hours, the ×1.2 applied; Infinity where Valhalla finds no way. */
	readonly travelHours: (origin: LatLon, targets: readonly LatLon[]) => Promise<number[]>;
}

/** Runs Valhalla's service on the region's tiles for as long as `use` takes. */
export async function withValhalla<T>(files: RegionFiles, tools: Tools, use: (service: ValhallaService) => Promise<T>): Promise<T> {
	// In a process group of its own: pyvalhalla's valhalla_service is a Python wrapper around the server, and
	// killing the wrapper alone would leave the server running.
	const server = spawn('valhalla_service', [files.valhallaConfig, '2'], { stdio: 'ignore', detached: true });
	const exited = new Promise((resolve) => {
		server.once('exit', resolve);
	});
	const url = `http://127.0.0.1:${tools.valhallaPort}`;
	try {
		await waitForService(url);
		return await use({
			async isochrones(origin, drivingMinutes) {
				const response = await post(`${url}/isochrone`, {
					locations: [origin],
					costing: 'auto',
					contours: drivingMinutes.map((time) => ({ time })),
					polygons: true,
					// Every polygon, as our engine keeps every one.
					denoise: 0,
				});
				const contours = contoursOf(response);
				return drivingMinutes.map((minutes) => {
					const contour = contours.find((one) => one.minutes === minutes);
					if (contour === undefined) {
						throw new Error(`Valhalla returned no contour of ${minutes} min`);
					}
					return contour.geometry;
				});
			},
			async travelHours(origin, targets) {
				const response = await post(`${url}/sources_to_targets`, { sources: [origin], targets, costing: 'auto' });
				const hours = targets.map(() => Infinity);
				for (const { index, seconds } of matrixRow(response)) {
					hours[index] = (seconds * TRAVEL_PER_DRIVING) / 3600;
				}
				return hours;
			},
		});
	} finally {
		// No pid: the service never started, so there is nothing to stop.
		if (server.pid !== undefined) {
			process.kill(-server.pid, 'SIGKILL');
			await exited;
		}
	}
}

/** The contours of an isochrone answer (GeoJSON features): each one's minutes, and its geometry as a MultiPolygon. */
function contoursOf(response: unknown): { minutes: unknown; geometry: MultiPolygon }[] {
	return items(field(response, 'features'), 'Valhalla’s isochrone features').map((feature) => ({
		minutes: field(field(feature, 'properties'), 'contour'),
		geometry: multiPolygon(field(feature, 'geometry')),
	}));
}

/** A GeoJSON MultiPolygon, or a Polygon as one; an error for any other geometry. */
export function multiPolygon(geometry: unknown): MultiPolygon {
	const type = field(geometry, 'type');
	const coordinates = field(geometry, 'coordinates');
	if (type === 'MultiPolygon') {
		return { type, coordinates: items(coordinates, 'a MultiPolygon').map((one) => polygon(one)) };
	}
	if (type === 'Polygon') {
		return { type: 'MultiPolygon', coordinates: [polygon(coordinates)] };
	}
	throw new TypeError(`a geometry of type ${String(type)}, not a polygon`);
}

/** A GeoJSON polygon's coordinates: its rings, each a list of [lon, lat]. */
function polygon(json: unknown): number[][][] {
	return items(json, 'a polygon').map((ring) => items(ring, 'a ring').map((point) => position(point)));
}

function position(json: unknown): number[] {
	const values = items(json, 'a position');
	if (!values.every((value) => typeof value === 'number')) {
		throw new TypeError('a position of other than numbers');
	}
	return [...values];
}

/** The travel times of the matrix's one row: the target's index, and seconds at the wheel where Valhalla has a way. */
function matrixRow(response: unknown): { index: number; seconds: number }[] {
	const [row] = items(field(response, 'sources_to_targets'), 'Valhalla’s sources_to_targets');
	return items(row, 'the matrix row').flatMap((cell) => {
		const time = field(cell, 'time');
		const index = field(cell, 'to_index');
		if (typeof index !== 'number' || (time !== null && typeof time !== 'number')) {
			throw new TypeError('Valhalla returned a matrix cell without to_index and time');
		}
		return time === null ? [] : [{ index, seconds: time }];
	});
}

async function waitForService(url: string): Promise<void> {
	for (let attempt = 0; attempt < 120; attempt++) {
		try {
			if ((await fetch(`${url}/status`)).ok) {
				return;
			}
		} catch {
			// Not listening yet.
		}
		await sleep(500);
	}
	throw new Error(`Valhalla's service at ${url} did not start`);
}

/** A POST by node:http: fetch gives up on headers after 5 min, and a ring of 12 h in a big region takes longer. */
function post(url: string, body: unknown): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const request = httpRequest(url, { method: 'POST' }, (response) => {
			const chunks: Buffer[] = [];
			response.on('data', (chunk: Buffer) => {
				chunks.push(chunk);
			});
			response.on('error', reject);
			response.on('end', () => {
				const text = Buffer.concat(chunks).toString('utf8');
				if (response.statusCode === 200) {
					resolve(JSON.parse(text));
				} else {
					reject(new Error(`${url}: HTTP ${response.statusCode} ${text.slice(0, 500)}`));
				}
			});
		});
		request.on('error', reject);
		request.end(JSON.stringify(body));
	});
}
