// Valhalla's side of the comparison: its rings and its travel times to cities, from its HTTP service on the
// region's tiles, with the auto costing as is. Valhalla knows driving time only: our ×1.2 is applied to its
// times, so a ring of N hours of travel lies between the contours of 50·(N − 1) and 50·N minutes at the wheel.
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import type { MultiPolygon } from 'engine';
import { TRAVEL_PER_DRIVING } from 'engine/traverse';
import type { RegionFiles, Tools } from './prepare.ts';

export interface ValhallaService {
	/** The contour of `drivingMinutes` at the wheel and of each further time given, in the same order. */
	isochrones(origin: LatLon, drivingMinutes: readonly number[]): Promise<MultiPolygon[]>;
	/** Travel time from the origin to each target in hours, the ×1.2 applied; Infinity where Valhalla finds no way. */
	travelHours(origin: LatLon, targets: readonly LatLon[]): Promise<number[]>;
}

export interface LatLon {
	readonly lat: number;
	readonly lon: number;
}

/** Runs Valhalla's service on the region's tiles for as long as `use` takes. */
export async function withValhalla<T>(files: RegionFiles, tools: Tools, use: (service: ValhallaService) => Promise<T>): Promise<T> {
	// In a process group of its own: pyvalhalla's valhalla_service is a Python wrapper around the server, and
	// killing the wrapper alone would leave the server running.
	const server = spawn('valhalla_service', [files.valhallaConfig, '2'], { stdio: 'ignore', detached: true });
	const exited = new Promise((resolve) => server.once('exit', resolve));
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
				const features = (response as { features: { properties: { contour: number }; geometry: MultiPolygon | Polygon }[] }).features;
				return drivingMinutes.map((minutes) => {
					const feature = features.find((one) => one.properties.contour === minutes);
					if (feature === undefined) {
						throw new Error(`Valhalla returned no contour of ${minutes} min`);
					}
					const { geometry } = feature;
					return geometry.type === 'MultiPolygon' ? geometry : { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
				});
			},
			async travelHours(origin, targets) {
				const response = await post(`${url}/sources_to_targets`, { sources: [origin], targets, costing: 'auto' });
				const [row] = (response as { sources_to_targets: { time: number | null; to_index: number }[][] }).sources_to_targets;
				const hours = targets.map(() => Infinity);
				for (const cell of row) {
					if (cell.time !== null) {
						hours[cell.to_index] = (cell.time * TRAVEL_PER_DRIVING) / 3600;
					}
				}
				return hours;
			},
		});
	} finally {
		process.kill(-server.pid!, 'SIGKILL');
		await exited;
	}
}

interface Polygon {
	readonly type: 'Polygon';
	readonly coordinates: number[][][];
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
			response.on('data', (chunk: Buffer) => chunks.push(chunk));
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
