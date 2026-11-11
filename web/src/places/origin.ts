// The places of the origin (GLOSSARY «Место точки старта», spec #154 «Загрузка», «Отбор мест кольца»): those the
// origin is inside or near, which no ring shows. The screen tells them by the rule of `data/places-file`
// (`originPlaces`), from the outlines of the cell of 1° × 1° that holds the origin (`placeOutlinesPath`, data's
// `build-places`), fetched by the origin's cell into TanStack Query and kept for the session, and from the radius of a
// small place. Only a cell some outline touches has a file: a 404 is a cell with no outlines, not a failure.
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
	decodePlaceOutlines,
	originPlaces,
	parsePlaceOutlinesFile,
	placeOutlinesCell,
	placeOutlinesPath,
	type Place,
	type PlaceOutline,
} from 'data/places-file';
import type { LatLon } from '../state/point.ts';
import { usePlacesFile } from './places.ts';

/** The outlines of the cell that holds `origin`; none for a cell without a file, a failure for any other answer. */
async function loadOutlines(origin: LatLon): Promise<readonly PlaceOutline[]> {
	const path = placeOutlinesPath(origin);
	const response = await fetch(path);
	if (response.status === 404) {
		return [];
	}
	if (!response.ok) {
		throw new Error(`${path}: HTTP ${response.status}`);
	}
	return decodePlaceOutlines(parsePlaceOutlinesFile(await response.json()));
}

const outlinesQuery = (origin: LatLon) =>
	queryOptions({
		queryKey: ['place-outlines', placeOutlinesCell(origin)],
		queryFn: async () => loadOutlines(origin),
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
	const { status, data: outlines } = useQuery({ ...outlinesQuery(origin ?? { lat: 0, lon: 0 }), enabled: origin !== undefined });
	return useMemo(() => {
		const settled = fileSettled && status !== 'pending';
		if (places === undefined || outlines === undefined || origin === undefined) {
			return { settled, places: undefined };
		}
		const ofOrigin = originPlaces(origin, places, outlines);
		return { settled, places: places.filter((place) => !ofOrigin.has(place.qid)) };
	}, [fileSettled, status, places, outlines, origin]);
}
