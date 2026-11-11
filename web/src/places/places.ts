// The places file (data's `build-places`, format `data/places-file`; spec #154 «Загрузка»): the places, points of
// interest that are no city, a static asset of the Worker beside the cities file. Fetched once, when the screen first
// needs it, and kept for the session in TanStack Query, as the cities file; not part of the first paint. A screen
// without it shows the cities alone and says nothing of it.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { decodePlaces, parsePlacesFile, PLACES_PATH, type Place } from 'data/places-file';

/** The places, the most famous first; a failure when the file cannot be had or is not of the format the client reads. */
async function loadPlaces(): Promise<readonly Place[]> {
	const response = await fetch(PLACES_PATH);
	if (!response.ok) {
		throw new Error(`${PLACES_PATH}: HTTP ${response.status}`);
	}
	return decodePlaces(parsePlacesFile(await response.json()));
}

const placesQuery = queryOptions({
	queryKey: ['places'],
	queryFn: loadPlaces,
	staleTime: Infinity,
	gcTime: Infinity,
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
});

/**
 * The places file: whether it is settled (the ring's points of interest wait for it), and the places once it came;
 * undefined until then, and if it could not be had (the screen then shows the cities alone).
 */
export function usePlacesFile(): { readonly settled: boolean; readonly places: readonly Place[] | undefined } {
	const { status, data } = useQuery(placesQuery);
	return useMemo(() => ({ settled: status !== 'pending', places: data }), [status, data]);
}
