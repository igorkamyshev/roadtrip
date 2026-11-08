// The screen's events from its state (screen-analytics.ts says when each goes): the start, the ring asked for and its
// answer, the cities file, and the page going away.
import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { RingResponse } from 'worker/api';
import type { City } from '../cities/cities.ts';
import { RingRequestError } from '../ring/fetch-ring.ts';
import type { Settings } from '../state/settings.ts';
import type { Start } from '../start/start.ts';
import { send } from './posthog.ts';
import { ScreenAnalytics } from './screen-analytics.ts';

export interface ScreenAnalyticsInput {
	readonly start: Start | undefined;
	/** The ring's query key as text; undefined without an origin. */
	readonly request: string | undefined;
	/** How many times «Повторить» was pressed: each is a request of its own. */
	readonly retries: number;
	readonly hours: number;
	readonly settings: Settings;
	readonly ring: UseQueryResult<RingResponse, RingRequestError>;
	readonly citiesFile: { readonly settled: boolean; readonly cities: readonly City[] | undefined };
}

export function useScreenAnalytics({ start, request, retries, hours, settings, ring, citiesFile }: ScreenAnalyticsInput): ScreenAnalytics {
	const [analytics] = useState(() => new ScreenAnalytics(send));

	useEffect(() => {
		if (citiesFile.settled) {
			analytics.citiesSettled(citiesFile.cities);
		}
	}, [analytics, citiesFile]);

	useEffect(() => {
		if (start !== undefined) {
			analytics.startSet(start);
		}
	}, [analytics, start]);

	// The answer the render shows for this request: its own, not a ring standing in for it, and no request under way.
	const answered = !ring.isFetching && !ring.isPlaceholderData;
	const id = request === undefined ? undefined : `${request}#${retries}`;

	// A new ask when the request or «Повторить» changes, and only then: the start, N and the settings are what the
	// request was made of. Memory is an answer already there, with nothing under way.
	useEffect(() => {
		if (id !== undefined && start !== undefined) {
			analytics.ringAsked({ id, start, hours, settings }, answered ? ring.data : undefined);
		}
	}, [analytics, id]);

	// Its answer, once it is there.
	const { data, error, dataUpdatedAt, errorUpdatedAt } = ring;
	useEffect(() => {
		if (id === undefined || !answered) {
			return;
		}
		if (error !== null) {
			analytics.ringAnswered(id, { failure: error instanceof RingRequestError ? error.failure : 'error' }, errorUpdatedAt);
		} else if (data !== undefined) {
			analytics.ringAnswered(id, { answer: data }, dataUpdatedAt);
		}
	}, [analytics, id, answered, data, error, dataUpdatedAt, errorUpdatedAt]);

	useEffect(() => {
		const leave = () => {
			analytics.leave();
		};
		window.addEventListener('pagehide', leave);
		return () => {
			window.removeEventListener('pagehide', leave);
		};
	}, [analytics]);

	return analytics;
}
