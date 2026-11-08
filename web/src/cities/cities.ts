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
	const file = (await response.json()) as CitiesFile;
	if (file.format !== CITIES_FORMAT) {
		throw new Error(`${CITIES_PATH}: format ${String(file.format)}, not ${CITIES_FORMAT}`);
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

const citiesQuery = queryOptions({
	queryKey: ['cities'],
	queryFn: loadCities,
	staleTime: Infinity,
	gcTime: Infinity,
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
});

/** The cities, or undefined until they come (and if they cannot be had: the screen then counts none). */
export function useCities(): readonly City[] | undefined {
	return useQuery(citiesQuery).data;
}

/** The cities file as the events need it: whether it is settled, the cities once it came, none if it could not be had. */
export function useCitiesFile(): { readonly settled: boolean; readonly cities: readonly City[] | undefined } {
	const { status, data } = useQuery(citiesQuery);
	return useMemo(() => ({ settled: status !== 'pending', cities: data }), [status, data]);
}
