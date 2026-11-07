// The cities whose travel times both engines are measured on: GeoNames cities of 15 000 people or more, as the
// spec's file of cities takes them («Набор данных»), without parts of cities and places that are gone.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const LEFT_OUT = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW']);

export interface City {
	readonly id: number;
	readonly name: string;
	readonly lat: number;
	readonly lon: number;
}

/** The cities, downloaded once into the work directory. Needs unzip. */
export async function loadCities(work: string): Promise<City[]> {
	const zip = join(work, 'cities15000.zip');
	if (!existsSync(zip)) {
		const response = await fetch(URL);
		if (!response.ok) {
			throw new Error(`${URL}: HTTP ${response.status}`);
		}
		writeFileSync(zip, new Uint8Array(await response.arrayBuffer()));
	}
	const text = execFileSync('unzip', ['-p', zip, 'cities15000.txt'], { encoding: 'utf8', maxBuffer: 1 << 28 });
	const cities: City[] = [];
	for (const line of text.split('\n')) {
		const fields = line.split('\t');
		if (fields.length < 15 || LEFT_OUT.has(fields[7]) || Number(fields[14]) < 15_000) {
			continue;
		}
		cities.push({ id: Number(fields[0]), name: fields[1], lat: Number(fields[4]), lon: Number(fields[5]) });
	}
	return cities;
}
