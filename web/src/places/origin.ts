// The places of the origin (GLOSSARY «Место точки старта», spec #154 «Загрузка», «Отбор мест кольца»): those the
// origin is inside or near, which no ring shows. The screen tells them by the rule of `data/places-file`
// (`originPlaces`), from the cell of 1° × 1° that holds the origin (`placeOutlinesPath`, data's `build-places`): the
// outlines of the large places and the radii of the small ones that touch it, fetched by the origin's cell into
// TanStack Query and kept for the session. Only a cell some place touches has a file: a 404 is an empty cell, not a
// failure.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
	decodePlaceOutlines,
	originPlaces,
	parsePlaceOutlinesFile,
	placeOutlinesCell,
	placeOutlinesPath,
	type Place,
	type PlaceOutlinesCell,
} from 'data/places-file';
import type { LatLon } from '../state/point.ts';
import { usePlacesFile } from './places.ts';

/** The cell that holds `origin`; an empty one for a cell without a file, a failure for any other answer. */
async function loadCell(origin: LatLon): Promise<PlaceOutlinesCell> {
	const path = placeOutlinesPath(origin);
	const response = await fetch(path);
	if (response.status === 404) {
		return { outlines: [], radii: [] };
	}
	if (!response.ok) {
		throw new Error(`${path}: HTTP ${response.status}`);
	}
	return decodePlaceOutlines(parsePlaceOutlinesFile(await response.json()));
}

const cellQuery = (origin: LatLon) =>
	queryOptions({
		queryKey: ['place-outlines', placeOutlinesCell(origin)],
		queryFn: async () => loadCell(origin),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});

/** Places and whether they are settled, as `usePlacesFile` has them. */
interface SettledPlaces {
	readonly settled: boolean;
	readonly places: readonly Place[] | undefined;
}

/**
 * The places a ring may show: the places file's but the origin's. Settled once the file and the origin's cell are;
 * without the cell, none (the screen shows the cities alone and says nothing of it), as without the file.
 */
export function useRingPlaces(origin: LatLon | undefined): SettledPlaces {
	const { settled: fileSettled, places } = usePlacesFile();
	const { status, data: cell } = useQuery({ ...cellQuery(origin ?? { lat: 0, lon: 0 }), enabled: origin !== undefined });
	return useMemo(() => {
		const settled = fileSettled && status !== 'pending';
		if (places === undefined || cell === undefined || origin === undefined) {
			return { settled, places: undefined };
		}
		const ofOrigin = originPlaces(origin, places, cell);
		return { settled, places: places.filter((place) => !ofOrigin.has(place.qid)) };
	}, [fileSettled, status, places, cell, origin]);
}
