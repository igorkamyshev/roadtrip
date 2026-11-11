// The first card's state (spec #20 «Экран», «Первая карточка, по состояниям») from the origin and the ring's query; the
// card (first-card.tsx) shows it, and the phrase's spinner turns with `calculating`.
import type { UseQueryResult } from '@tanstack/react-query';
import type { RingResponse } from 'worker/api';
import { countOf } from '../points/in-ring.ts';
import type { PointOfInterest } from '../points/point-of-interest.ts';
import { RingRequestError } from '../ring/fetch-ring.ts';
import type { LatLon } from '../state/point.ts';
import { citizenshipsLabel } from './countries.ts';
import type { FirstCardState } from './first-card.tsx';

export interface FirstCardInput {
	readonly origin: LatLon | undefined;
	readonly hours: number;
	readonly ring: UseQueryResult<RingResponse, RingRequestError>;
	/** The browser gave no position: the card without an origin says so. */
	readonly geolocationFailed: boolean;
	/** The request shown: «Считаем…» counts its 5 s from the request's start. */
	readonly request: string;
	/** The ring's points of interest, once the ring is this request's and the cities file came; undefined till then. */
	readonly points: readonly PointOfInterest[] | undefined;
}

export function firstCardState({ origin, hours, ring, geolocationFailed, request, points }: FirstCardInput): FirstCardState {
	if (origin === undefined) {
		return { kind: 'no_origin', geolocationFailed };
	}
	// A request under way with no answer of its own yet: an old ring may stand in for it.
	if (ring.isFetching && (ring.isPlaceholderData || ring.data === undefined)) {
		return { kind: 'calculating', hours, request };
	}
	if (ring.error !== null) {
		return { kind: ring.error instanceof RingRequestError ? ring.error.failure : 'error' };
	}
	return ring.data === undefined ? { kind: 'calculating', hours, request } : answerState(ring.data, hours, points);
}

function answerState(answer: RingResponse, hours: number, points: readonly PointOfInterest[] | undefined): FirstCardState {
	if (answer.outcome === 'ring') {
		return ringState(hours, points);
	}
	if (answer.outcome === 'empty') {
		return { kind: 'empty', maxHours: answer.maxHours };
	}
	if (answer.outcome === 'visa_rules_missing') {
		return { kind: 'visa_rules_missing', citizenship: citizenshipsLabel([answer.missingCitizenship]) };
	}
	// `no_roads` and `no_ring`: the card's state is the engine's outcome.
	return { kind: answer.outcome };
}

/** The ring's card: with its points of interest and countries once they are known, or that it holds none. */
function ringState(hours: number, points: readonly PointOfInterest[] | undefined): FirstCardState {
	if (points === undefined) {
		return { kind: 'ring', hours };
	}
	return points.length === 0 ? { kind: 'no_cities' } : { kind: 'ring', hours, points: countOf(points) };
}
