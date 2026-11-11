// The ring the screen shows (spec #20 «Экран», «Состояние, ссылка и память браузера»): the request for the state's
// origin, N and settings, the answer shown with its visa rules, the ring's points of interest, the hours in memory, and
// the events that follow them (src/analytics/).
import { useMemo, useState } from 'react';
import type { RingResponse } from 'worker/api';
import type { ScreenAnalytics } from '../analytics/screen-analytics.ts';
import { useScreenAnalytics } from '../analytics/use-screen-analytics.ts';
import { useCitiesFile, type City } from '../cities/cities.ts';
import { usePlacesFile } from '../places/places.ts';
import { pointsInRing } from '../points/in-ring.ts';
import type { PointOfInterest } from '../points/point-of-interest.ts';
import { ringKey, useCachedHours, useRing } from '../ring/use-ring.ts';
import type { ScreenStateControls } from '../state/use-screen-state.ts';

/** An answer with visa rules: a ring, or the engine's reason for none. */
type Answer = Exclude<RingResponse, { readonly outcome: 'visa_rules_missing' }>;

export interface ShownRing {
	/** The query of the ring asked for: the first card follows it. */
	readonly ring: ReturnType<typeof useRing>;
	/**
	 * The request the screen shows, its query key as text ('' without an origin): what the 5 s of «Считаем…», the
	 * camera's fit to a new ring and `ring result` follow.
	 */
	readonly requestId: string;
	/** «Повторить»: the request again, an ask of its own for `ring result`. */
	readonly retry: () => void;
	readonly analytics: ScreenAnalytics;
	/** The cities file's cities; undefined until they come. */
	readonly cities: readonly City[] | undefined;
	/** The ring on the map: this request's, or the previous one of the same origin standing in for it, striped. */
	readonly geometry: Extract<RingResponse, { readonly outcome: 'ring' }>['ring'] | undefined;
	/** The answer whose visa rules the screen shows: what is hatched, how old the rules are, which points of interest are open. */
	readonly answer: Answer | undefined;
	/** The zones the answer closes, hatched on the map. */
	readonly closed: readonly string[];
	/**
	 * The ring's points of interest, the most famous first, once the ring is this request's (not an old one), the cities
	 * came and the places file is settled: the cities alone if it could not be had. Undefined until then, so that the
	 * carousel is not built anew when the places come.
	 */
	readonly shownPoints: readonly PointOfInterest[] | undefined;
	/** The cells, hours and days, whose rings are in memory for this origin and settings: the slider's marked ones. */
	readonly cachedHours: ReadonlySet<number>;
}

export function useShownRing({ origin, start, hours, settings }: ScreenStateControls): ShownRing {
	const ring = useRing(origin, hours, settings);
	const citiesFile = useCitiesFile();
	const placesFile = usePlacesFile();
	const cachedHours = useCachedHours(origin, settings);
	const requestId = origin === undefined ? '' : JSON.stringify(ringKey(origin, hours, settings));
	const [retries, setRetries] = useState(0);
	const analytics = useScreenAnalytics({
		start,
		request: origin === undefined ? undefined : requestId,
		retries,
		hours,
		settings,
		ring,
		citiesFile,
		placesFile,
	});
	const { data } = ring;
	const geometry = data?.outcome === 'ring' ? data.ring : undefined;
	const answer = data?.outcome === 'visa_rules_missing' ? undefined : data;
	const access = answer?.access;
	const { cities } = citiesFile;
	const { settled: placesSettled, places } = placesFile;
	const ringPoints = useMemo(
		() =>
			cities === undefined || !placesSettled || geometry === undefined || access === undefined || origin === undefined
				? undefined
				: pointsInRing({ cities, places: places ?? [] }, { ring: geometry, access, origin }),
		[cities, placesSettled, places, geometry, access, origin],
	);
	const closed = useMemo(
		() => (access === undefined ? [] : Object.keys(access).filter((code) => access[code].mode === 'closed')),
		[access],
	);
	const retry = (): void => {
		setRetries((count) => count + 1);
		void ring.refetch();
	};
	const shownPoints = ring.isPlaceholderData ? undefined : ringPoints;
	return { ring, requestId, retry, analytics, cities, geometry, answer, closed, shownPoints, cachedHours };
}
