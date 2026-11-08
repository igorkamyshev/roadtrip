// The rings of the session in TanStack Query (spec «Состояние, ссылка и память браузера»): one query per origin, N,
// citizenships and held visas. An answer stays in memory to the end of the session and is shown again without a
// request, but for `visa_rules_missing`, forgotten once the screen asks for something else; nothing repeats a request
// by itself, only «Повторить». While a ring comes, the previous ring of the same
// origin stands in for it. Every change of what the screen asks for passes through `useRing` (`ring result`,
// src/analytics/, tells an answer from memory as `source: memory`).
import { hashKey, queryOptions, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
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
	const client = useQueryClient();
	const options = ringQuery(origin, hours, settings);
	const ring = useQuery(options);
	// The visa rules missing is no ring to keep: the card says «Попробуйте позже», so once the screen asks for
	// something else the answer is forgotten, and asking for it again asks the Worker.
	const missing = !ring.isPlaceholderData && isMissing(ring.data);
	const key = options.queryKey;
	const keyHash = hashKey(key);
	useEffect(() => {
		if (!missing) {
			return undefined;
		}
		return () => {
			if (isMissing(client.getQueryData<RingResponse>(key))) {
				client.removeQueries({ queryKey: key, exact: true });
			}
		};
	}, [client, missing, keyHash]);
	return ring;
}

function isMissing(answer: RingResponse | undefined): boolean {
	return answer?.outcome === 'visa_rules_missing';
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
			const answer = client.getQueryData<RingResponse>(ringKey(origin, hours, settings));
			if (answer !== undefined && !isMissing(answer)) {
				cached.push(hours);
			}
		}
		return cached.join(',');
	};
	const text = useSyncExternalStore(subscribe, snapshot);
	return useMemo(() => new Set(text === '' ? [] : text.split(',').map(Number)), [text]);
}
