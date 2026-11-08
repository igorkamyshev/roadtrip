// When the screen's events go and what they say (spec «Аналитика и ошибки», «Свои события браузера»; decision #18).
// The place of `start set` and `ring result` is the nearest city of the cities file, so both wait for the file:
// they go once it came, or could not be had (then without a place), with the time they happened.
//
// `ring result` is exactly one for each ring the screen asks for: on load, when the slider is let go (it changes N
// only then), for other settings or another origin, and for «Повторить». An answer from memory is `memory` at once; a
// request ends with its answer, or `abandoned` when the screen asks for something else first or the person leaves the
// page (then by `sendBeacon`, as is everything still waiting).
import type { RingResponse } from 'worker/api';
import type { City } from '../cities/cities.ts';
import { citiesInRing, countOf } from '../cities/in-ring.ts';
import { nearestCity } from '../cities/nearest.ts';
import type { RingFailure } from '../ring/fetch-ring.ts';
import type { Settings } from '../state/settings.ts';
import type { GeolocationFailure } from '../start/geolocation.ts';
import type { Start } from '../start/start.ts';
import type { BrowserEvent, BrowserEvents, Place, RingResult } from './events.ts';
import type { SendOptions } from './posthog.ts';

export type Send = <Event extends BrowserEvent>(event: Event, properties: BrowserEvents[Event], options?: SendOptions) => void;

/** A ring the screen asks for. */
export interface RingAsk {
	/** The ring's query key, and the time the person asked for it again («Повторить»): an ask of its own. */
	readonly id: string;
	/** How the origin was set, for the place. */
	readonly start: Start;
	readonly hours: number;
	readonly settings: Settings;
}

/** How a ring request ended: the answer (from memory or not), a failure, or nothing yet when the screen moved on. */
type Ending = { readonly answer: RingResponse; readonly memory: boolean } | { readonly failure: RingFailure } | 'abandoned';

/** An event that waits for the cities file: its properties once the cities are known (none if they cannot be had). */
interface Waiting {
	readonly properties: (cities: readonly City[] | undefined) => BrowserEvents[BrowserEvent];
	readonly event: BrowserEvent;
	/** When it happened (ms since the epoch). */
	readonly at: number;
}

export class ScreenAnalytics {
	#cities: { readonly settled: false } | { readonly settled: true; readonly cities: readonly City[] | undefined } = { settled: false };
	#waiting: Waiting[] = [];
	#lastStart: Start | undefined;
	#lastAsk: string | undefined;
	/** The ring request under way: what was asked and when. */
	#pending: { readonly ask: RingAsk; readonly askedAt: number } | undefined;

	constructor(
		private readonly send: Send,
		/** Milliseconds since the epoch, the clock TanStack Query stamps its answers with. */
		private readonly now: () => number = Date.now,
	) {}

	/** The cities file came, or could not be had (undefined): what waited for it goes. */
	citiesSettled(cities: readonly City[] | undefined): void {
		if (this.#cities.settled) {
			return;
		}
		this.#cities = { settled: true, cities };
		const waiting = this.#waiting.splice(0);
		for (const event of waiting) {
			this.send(event.event, event.properties(cities), { at: new Date(event.at) });
		}
	}

	/** `start set`, for each new start (the same object is the same start). */
	startSet(start: Start): void {
		if (start === this.#lastStart) {
			return;
		}
		this.#lastStart = start;
		this.#emit('start set', (cities) => ({ method: start.method, ...placeOf(start, cities) }), this.now());
	}

	geolocationFailed(reason: GeolocationFailure): void {
		this.send('geolocation failed', { reason });
	}

	/**
	 * The screen asks for a ring: `memory` is its answer when the browser has it already. A request under way for
	 * something else is abandoned.
	 */
	ringAsked(ask: RingAsk, memory: RingResponse | undefined): void {
		if (ask.id === this.#lastAsk) {
			return;
		}
		this.#lastAsk = ask.id;
		this.abandon();
		const askedAt = this.now();
		if (memory === undefined) {
			this.#pending = { ask, askedAt };
		} else {
			this.#ringResult(ask, { answer: memory, memory: true }, 0, askedAt);
		}
	}

	/** The answer to the ring request `id`, which came at `at` (ms since the epoch): ignored unless it is the one under way. */
	ringAnswered(id: string, ending: { readonly answer: RingResponse } | { readonly failure: RingFailure }, at: number): void {
		const pending = this.#pending;
		if (pending?.ask.id !== id) {
			return;
		}
		this.#pending = undefined;
		// The answer may be stamped a moment before the screen noted the ask.
		this.#ringResult(pending.ask, 'answer' in ending ? { answer: ending.answer, memory: false } : ending, Math.max(0, at - pending.askedAt), at);
	}

	/** The request under way, if any, ends `abandoned` now. */
	abandon(): void {
		const pending = this.#pending;
		if (pending === undefined) {
			return;
		}
		this.#pending = undefined;
		const now = this.now();
		this.#ringResult(pending.ask, 'abandoned', now - pending.askedAt, now);
	}

	/** The person leaves the page: the request under way is abandoned, and everything still waiting goes by beacon. */
	leave(): void {
		this.abandon();
		const cities = this.#cities.settled ? this.#cities.cities : undefined;
		for (const event of this.#waiting.splice(0)) {
			this.send(event.event, event.properties(cities), { at: new Date(event.at), beacon: true });
		}
	}

	#ringResult(ask: RingAsk, ending: Ending, waitMs: number, at: number): void {
		const asked = { hours: ask.hours, citizenships: ask.settings.citizenships, held_visas: ask.settings.visas, wait_ms: Math.round(waitMs) };
		this.#emit(
			'ring result',
			(cities): RingResult => ({ ...outcomeOf(ending, cities), ...asked, ...placeOf(ask.start, cities) }),
			at,
		);
	}

	/** Sends the event now if the cities are known, else when they are. */
	#emit<Event extends BrowserEvent>(event: Event, properties: (cities: readonly City[] | undefined) => BrowserEvents[Event], at: number): void {
		if (this.#cities.settled) {
			this.send(event, properties(this.#cities.cities));
		} else {
			this.#waiting.push({ event, properties, at });
		}
	}
}

/** The outcome, the source and, for a ring once the cities are known, its cities and their countries. */
function outcomeOf(ending: Ending, cities: readonly City[] | undefined): Pick<RingResult, 'outcome' | 'source' | 'cities_count' | 'countries_count'> {
	if (ending === 'abandoned') {
		return { outcome: 'abandoned' };
	}
	if ('failure' in ending) {
		return { outcome: ending.failure };
	}
	const { answer, memory } = ending;
	if (answer.outcome === 'visa_rules_missing') {
		return memory ? { outcome: answer.outcome, source: 'memory' } : { outcome: answer.outcome };
	}
	const source = memory ? 'memory' : answer.source;
	if (answer.outcome !== 'ring' || cities === undefined) {
		return { outcome: answer.outcome, source };
	}
	// As the first card counts them.
	const { count, countries } = countOf(citiesInRing(cities, answer.ring, answer.access));
	return { outcome: answer.outcome, source, cities_count: count, countries_count: countries };
}

/** Where the origin is: the city picked in the search, else the nearest city of the file; nothing without the file. */
export function placeOf(start: Start, cities: readonly City[] | undefined): Place {
	const city = start.method === 'search' ? start.city : cities === undefined ? undefined : nearestCity(cities, start.origin);
	return city === undefined ? {} : { start_country: city.zone, start_city: city.name, start_city_id: city.id };
}
