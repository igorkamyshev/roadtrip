// The cities file (data's `build-cities`, spec «Файл городов»): GeoNames' cities from 15 000 people, a static asset
// of the Worker. Fetched once, when the screen first needs it, and kept for the session in TanStack Query.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CITIES_FORMAT, CITIES_PATH, decodeCities, type CitiesFile } from 'data/cities-file';

/** A city, a point of interest of the carousel (GLOSSARY «Точка интереса»). */
export interface City {
	/** GeoNames' id. */
	readonly id: number;
	/** The Russian name, or the local one where there is no Russian. */
	readonly name: string;
	/** The local name, shown under the Russian one when it differs; undefined when `name` is it. */
	readonly local: string | undefined;
	readonly lat: number;
	readonly lon: number;
	readonly population: number;
	/** The zone, as `access` names it: alpha-3, `RKS`, `NX` or a closed territory's code. */
	readonly zone: string;
}

/** The cities, biggest first; a failure when the file cannot be had or is not of the format the client reads. */
async function loadCities(): Promise<readonly City[]> {
	const response = await fetch(CITIES_PATH);
	if (!response.ok) {
		throw new Error(`${CITIES_PATH}: HTTP ${response.status}`);
	}
	const file: unknown = await response.json();
	if (!isCitiesFile(file)) {
		throw new Error(`${CITIES_PATH}: not a cities file of format ${String(CITIES_FORMAT)}`);
	}
	return decodeCities(file).map(([id, ru, local, lat, lon, population, zone]) => ({
		id,
		name: ru === '' ? local : ru,
		local: ru === '' || ru === local ? undefined : local,
		lat,
		lon,
		population,
		zone,
	}));
}

/** A cities file of the format the client reads: its rows are then the format's (data/cities-file). */
function isCitiesFile(file: unknown): file is CitiesFile {
	return (
		typeof file === 'object' &&
		file !== null &&
		'format' in file &&
		file.format === CITIES_FORMAT &&
		'cities' in file &&
		Array.isArray(file.cities)
	);
}

/** Biggest first: by population, then by id, as the cities file's order and every list of cities on the screen. */
export function biggestFirst(one: Pick<City, 'id' | 'population'>, two: Pick<City, 'id' | 'population'>): number {
	return one.population === two.population ? one.id - two.id : two.population - one.population;
}

const citiesQuery = queryOptions({
	queryKey: ['cities'],
	queryFn: loadCities,
	staleTime: Infinity,
	gcTime: Infinity,
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
});

/**
 * The cities file: whether it is settled (the events wait for it), and the cities once it came; undefined until then,
 * and if it could not be had (the screen then counts none).
 */
export function useCitiesFile(): { readonly settled: boolean; readonly cities: readonly City[] | undefined } {
	const { status, data } = useQuery(citiesQuery);
	return useMemo(() => ({ settled: status !== 'pending', cities: data }), [status, data]);
}
