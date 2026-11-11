// The rings of the session in TanStack Query (spec #20 «Состояние, ссылка и память браузера»): one query per origin, N,
// citizenships and held visas. An answer stays in memory to the end of the session and is shown again without a
// request, but for `visa_rules_missing`, forgotten once the screen asks for something else; nothing repeats a request
// by itself, only «Повторить». While a ring comes, the previous ring of the same
// origin stands in for it. Every change of what the screen asks for passes through `useRing` (`ring result`,
// src/analytics/, tells an answer from memory as `source: memory`).
import { queryOptions, skipToken, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { cellRing, type RingResponse, SLIDER_CELLS } from 'worker/api';
import { KEPT_FOR_THE_SESSION } from '../session-cache.ts';
import { pointText, type LatLon } from '../state/point.ts';
import type { Settings } from '../state/settings.ts';
import { fetchRing, type RingRequestError } from './fetch-ring.ts';

/** The query key of a ring: ['ring', origin, the slider's cell (its upper bound in hours), citizenships, visas]. */
export function ringKey(origin: LatLon, hours: number, settings: Settings): readonly ['ring', string, number, string, string] {
	return ['ring', pointText(origin), hours, settings.citizenships.join(','), settings.visas.join(',')];
}

function ringQuery(origin: LatLon | undefined, hours: number, settings: Settings) {
	return queryOptions<RingResponse, RingRequestError>({
		queryKey: origin === undefined ? ['ring'] : ringKey(origin, hours, settings),
		queryFn:
			origin === undefined
				? skipToken
				: () => fetchRing({ origin, ...cellRing(hours), citizenships: settings.citizenships, visas: settings.visas }),
		...KEPT_FOR_THE_SESSION,
		// The previous ring while this one comes, if it was for the same origin: the map shows it striped.
		placeholderData: (previous, previousQuery) =>
			origin !== undefined && previousQuery?.queryKey[1] === pointText(origin) ? previous : undefined,
	});
}

/**
 * The ring of the origin, N and settings. The origin and the settings are the same objects while they stay
 * (useScreenState), and so is the query's key: the answer's memory is kept by it.
 */
export function useRing(origin: LatLon | undefined, hours: number, settings: Settings): UseQueryResult<RingResponse, RingRequestError> {
	const client = useQueryClient();
	const options = useMemo(() => ringQuery(origin, hours, settings), [origin, hours, settings]);
	const ring = useQuery(options);
	// The visa rules missing is no ring to keep: the card says «Попробуйте позже», so once the screen asks for
	// something else the answer is forgotten, and asking for it again asks the Worker.
	const missing = !ring.isPlaceholderData && isMissing(ring.data);
	const key = options.queryKey;
	useEffect(() => (missing ? forgetMissing(client, key) : undefined), [client, missing, key]);
	return ring;
}

/** The effect's cleanup that forgets the answer `visa_rules_missing` of `key` once the screen asks for something else. */
function forgetMissing(client: QueryClient, key: readonly unknown[]): () => void {
	return () => {
		if (isMissing(client.getQueryData<RingResponse>(key))) {
			client.removeQueries({ queryKey: key, exact: true });
		}
	};
}

function isMissing(answer: RingResponse | undefined): boolean {
	return answer?.outcome === 'visa_rules_missing';
}

/** The cells, hours and days, whose rings are in memory for this origin and settings: the slider's marked ones. */
export function useCachedHours(origin: LatLon | undefined, settings: Settings): ReadonlySet<number> {
	const client = useQueryClient();
	const subscribe = useCallback((onChange: () => void) => client.getQueryCache().subscribe(onChange), [client]);
	const snapshot = (): string => {
		if (origin === undefined) {
			return '';
		}
		const cached: number[] = [];
		for (const hours of SLIDER_CELLS) {
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
