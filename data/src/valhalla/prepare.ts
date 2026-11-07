// The files of a region for both engines, made once in the work directory:
//
// - highways.osm.pbf: every way a car may drive (Valhalla's full graph), the turn restrictions, no ferries;
// - roads.osm.pbf: the roads of our graph, motorway to tertiary with their links, cut from the same file;
// - valhalla.json and tiles/: Valhalla's config and its tiles of highways.osm.pbf, built without admin areas or
//   time zones, so it knows no borders and adds no time on them.
//
// Needs osmium-tool, and Valhalla's commands on PATH (`pip install pyvalhalla` in an activated venv).
import { execFileSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { CLASS_SPEED_KMH } from '../roads.ts';
import type { Region } from './places.ts';

/** The highway values a car may drive in Valhalla's auto costing: its full graph. */
const CAR_HIGHWAYS = [...Object.keys(CLASS_SPEED_KMH), 'unclassified', 'residential', 'living_street', 'service', 'road', 'track'];

export interface Tools {
	/** Where downloads come from: Geofabrik, or a mirror in its layout. */
	readonly extractBase: string;
	/** The port the region's Valhalla service listens on. */
	readonly valhallaPort: number;
	readonly log: (line: string) => void;
}

export interface RegionFiles {
	readonly directory: string;
	readonly highways: string;
	readonly roads: string;
	readonly valhallaConfig: string;
	readonly tiles: string;
}

export function regionFiles(work: string, region: Region): RegionFiles {
	const directory = join(work, 'regions', region.id);
	return {
		directory,
		highways: join(directory, 'highways.osm.pbf'),
		roads: join(directory, 'roads.osm.pbf'),
		valhallaConfig: join(directory, 'valhalla.json'),
		tiles: join(directory, 'tiles'),
	};
}

/** Downloads and filters the region's extracts into highways.osm.pbf and roads.osm.pbf, unless they are there. */
export async function prepareRoads(work: string, region: Region, tools: Tools): Promise<RegionFiles> {
	const files = regionFiles(work, region);
	mkdirSync(files.directory, { recursive: true });
	if (!existsSync(files.highways) && !existsSync(files.roads)) {
		const download = join(files.directory, 'download');
		mkdirSync(download, { recursive: true });
		const parts: string[] = [];
		for (const path of region.extracts) {
			const url = /^https?:\/\//u.test(path) ? path : `${tools.extractBase}/${path}-latest.osm.pbf`;
			const name = path.split('/').at(-1)!.replace(/\.pbf$/u, '');
			const raw = join(download, `${name}.osm.pbf`);
			await fetchFile(url, raw, tools);
			const part = join(download, `${name}-highways.osm.pbf`);
			run('osmium', ['tags-filter', '--overwrite', '-o', part, raw, `w/highway=${CAR_HIGHWAYS.join(',')}`, 'r/type=restriction'], tools);
			rmSync(raw);
			parts.push(part);
		}
		run('osmium', ['merge', '--overwrite', '-f', 'pbf', '-o', `${files.highways}.part`, ...parts], tools);
		renameSync(`${files.highways}.part`, files.highways);
		rmSync(download, { recursive: true });
	}
	if (!existsSync(files.roads)) {
		run('osmium', ['tags-filter', '--overwrite', '-o', files.roads, files.highways, `w/highway=${Object.keys(CLASS_SPEED_KMH).join(',')}`], tools);
	}
	return files;
}

/** Writes Valhalla's config and builds its tiles of highways.osm.pbf, unless they are there. */
export function prepareValhalla(files: RegionFiles, tools: Tools): void {
	const config = JSON.parse(
		run(
			'valhalla_build_config',
			[
				'--mjolnir-tile-dir',
				files.tiles,
				'--mjolnir-tile-extract',
				'',
				'--mjolnir-traffic-extract',
				'',
				'--mjolnir-admin',
				'',
				'--mjolnir-timezone',
				'',
				'--httpd-service-listen',
				`tcp://127.0.0.1:${tools.valhallaPort}`,
				// A ring of 12 h is a contour of 600 min at the wheel; the cities of a start point are one matrix row.
				'--service-limits-isochrone-max-time-contour',
				'720',
				'--service-limits-auto-max-matrix-distance',
				'5000000',
				'--service-limits-auto-max-matrix-location-pairs',
				'100000',
				// One source to many targets: one Dijkstra from the origin.
				'--thor-source-to-target-algorithm',
				'timedistancematrix',
				// A city on an island of roads gets no time instead of failing the whole matrix.
				'--loki-use-connectivity',
				'False',
			],
			tools,
		),
	) as unknown;
	writeFileSync(files.valhallaConfig, JSON.stringify(config, null, 2));
	if (existsSync(join(files.tiles, '.built'))) {
		return;
	}
	rmSync(files.tiles, { recursive: true, force: true });
	tools.log(`building Valhalla's tiles of ${files.highways}`);
	run('valhalla_build_tiles', ['-c', files.valhallaConfig, files.highways], tools, files.directory);
	writeFileSync(join(files.tiles, '.built'), '');
}

function run(command: string, args: string[], tools: Tools, cwd?: string): string {
	const started = performance.now();
	const output = execFileSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
	tools.log(`${command} ${args.at(-1)}: ${((performance.now() - started) / 1000).toFixed(0)} s`);
	return output;
}

async function fetchFile(url: string, path: string, tools: Tools): Promise<void> {
	const started = performance.now();
	const response = await fetch(url);
	if (!response.ok || response.body === null) {
		throw new Error(`${url}: HTTP ${response.status}`);
	}
	await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(path));
	tools.log(`downloaded ${url} in ${((performance.now() - started) / 1000).toFixed(0)} s`);
}
