// What the screen fetches once and keeps for the session in TanStack Query: the rings' answers, the cities and places
// files, the origin's cell of outlines. And a file the screen waits for: settled or not, and what it holds.
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useMemo } from 'react';

/** The query options of what is kept for the session: never stale, never collected, never fetched again, no retry. */
export const KEPT_FOR_THE_SESSION = {
	staleTime: Infinity,
	gcTime: Infinity,
	retry: false,
	refetchOnWindowFocus: false,
	refetchOnReconnect: false,
} as const;

/**
 * A file the screen waits for: whether it is settled, and what it holds once it came; undefined until then, and if it
 * could not be had.
 */
export interface Settled<Contents> {
	readonly settled: boolean;
	readonly contents: Contents | undefined;
}

/** The file a query fetches, as `Settled`: settled once it came or could not be had. */
export function useSettledFile<Contents>(options: UseQueryOptions<Contents, Error, Contents, string[]>): Settled<Contents> {
	const { status, data } = useQuery(options);
	return useMemo(() => ({ settled: status !== 'pending', contents: data }), [status, data]);
}
