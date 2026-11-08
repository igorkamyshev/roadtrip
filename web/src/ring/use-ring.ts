// The rings of the session in TanStack Query (spec «Состояние, ссылка и память браузера»): one query per origin, N,
// citizenships and held visas. An answer stays in memory to the end of the session and is shown again without a
// request; nothing repeats a request by itself, only «Повторить». While a ring comes, the previous ring of the same
// origin stands in for it. Every change of what the screen asks for passes through `useRing` (`ring result`,
// src/analytics/, tells an answer from memory as `source: memory`).
import { queryOptions, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { RingResponse } from 'worker/api';
import { pointText, type LatLon } from '../state/point.ts';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import type { Settings } from '../state/settings.ts';
import { fetchRing, type RingRequestError } from './fetch-ring.ts';

/** The query key of a ring: ['ring', origin, N, citizenships, visas]. */
export function ringKey(origin: LatLon, hours: number, settings: Settings) {
	return ['ring', pointText(origin), hours, settings.citizenships.join(','), settings.visas.join(',')] as const;
}

function ringQuery(origin: LatLon | undefined, hours: number, settings: Settings) {
	return queryOptions<RingResponse, RingRequestError>({
		queryKey: origin === undefined ? ['ring'] : ringKey(origin, hours, settings),
		queryFn:
			origin === undefined
				? skipToken
				: () => fetchRing({ origin, hours, citizenships: settings.citizenships, visas: settings.visas }),
		staleTime: Infinity,
		gcTime: Infinity,
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		// The previous ring while this one comes, if it was for the same origin: the map shows it striped.
		placeholderData: (previous, previousQuery) =>
			origin !== undefined && previousQuery?.queryKey[1] === pointText(origin) ? previous : undefined,
	});
}

export function useRing(origin: LatLon | undefined, hours: number, settings: Settings) {
	return useQuery(ringQuery(origin, hours, settings));
}

/** The hours whose rings are in memory for this origin and settings: the dots on the slider. */
export function useCachedHours(origin: LatLon | undefined, settings: Settings): ReadonlySet<number> {
	const client = useQueryClient();
	const subscribe = useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
	const snapshot = (): string => {
		if (origin === undefined) {
			return '';
		}
		const cached: number[] = [];
		for (let hours = MIN_HOURS; hours <= MAX_HOURS; hours++) {
			if (client.getQueryData(ringKey(origin, hours, settings)) !== undefined) {
				cached.push(hours);
			}
		}
		return cached.join(',');
	};
	const text = useSyncExternalStore(subscribe, snapshot);
	return useMemo(() => new Set(text === '' ? [] : text.split(',').map(Number)), [text]);
}
