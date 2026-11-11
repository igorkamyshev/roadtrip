// When the screen's events go and what they say (spec #20 «Аналитика и ошибки», «Свои события браузера»; decision #18;
// spec #154 «События (PostHog)»). The origin's city of `start set`, `ring result` and `route opened` is the nearest city
// of the cities file, so they wait for the file, and `ring result` for the places file too, for the ring's places: they
// go once what they wait for came, or could not be had (then without what it gives), with the time they happened.
//
// `ring result` is exactly one for each ring the screen asks for: on load, when the slider is let go (it changes N
// only then), for other settings or another origin, and for «Повторить». An answer from memory is `memory` at once; a
// request ends with its answer, or `abandoned` when the screen asks for something else first or the person leaves the
// page (then by `sendBeacon`, as is everything still waiting).
import type { RingResponse } from 'worker/api';
import { nearestCity } from '../cities/nearest.ts';
import { countOf, kindsOf, pointsInRing, type PointsFiles } from '../points/in-ring.ts';
import type { PointOfInterest } from '../points/point-of-interest.ts';
import type { RingFailure } from '../ring/fetch-ring.ts';
import type { Settings } from '../state/settings.ts';
import type { GeolocationFailure } from '../start/geolocation.ts';
import type { Start } from '../start/start.ts';
import type { BrowserEvent, BrowserEvents, RingResult, StartCity } from './events.ts';
import type { SendOptions } from './posthog.ts';

export type Send = <Event extends BrowserEvent>(event: Event, properties: BrowserEvents[Event], options?: SendOptions) => void;

/** A ring the screen asks for. */
export interface RingAsk {
	/** The ring's query key, and the time the person asked for it again («Повторить»): an ask of its own. */
	readonly id: string;
	/** How the origin was set, for its city. */
	readonly start: Start;
	readonly hours: number;
	readonly settings: Settings;
}

/** How a ring request ended: the answer (from memory or not), a failure, or nothing yet when the screen moved on. */
type Ending = { readonly answer: RingResponse; readonly memory: boolean } | { readonly failure: RingFailure } | 'abandoned';

/** A file the events wait for: not settled yet, or settled with what it holds (undefined if it could not be had). */
type Settled<Contents> = { readonly settled: false } | { readonly settled: true; readonly contents: Contents | undefined };

/** What the files the events wait for gave, the cities file and the places file: undefined for one not settled or not had. */
type Files = { readonly [File in keyof PointsFiles]: PointsFiles[File] | undefined };

/** An event that waits for the files: its properties once they are known. */
interface Waiting {
	readonly properties: (files: Files) => BrowserEvents[BrowserEvent];
	readonly event: BrowserEvent;
	/** When it happened (ms since the epoch). */
	readonly at: number;
	/** Whether it waits for the places file too, not the cities file alone. */
	readonly places: boolean;
}

export class ScreenAnalytics {
	#cities: Settled<PointsFiles['cities']> = { settled: false };
	#places: Settled<PointsFiles['places']> = { settled: false };
	#waiting: Waiting[] = [];
	#lastStart: Start | undefined;
	#lastAsk: string | undefined;
	/** The ring request under way: what was asked and when. */
	#pending: { readonly ask: RingAsk; readonly askedAt: number } | undefined;
	/** While the page goes away: what goes now goes by beacon. */
	#leaving = false;

	constructor(
		private readonly send: Send,
		/** Milliseconds since the epoch, the clock TanStack Query stamps its answers with. */
		private readonly now: () => number = Date.now,
	) {}

	/** The cities file came, or could not be had (undefined): what waited for it goes. */
	citiesSettled(cities: Files['cities']): void {
		if (!this.#cities.settled) {
			this.#cities = { settled: true, contents: cities };
			this.#sendReady();
		}
	}

	/** The places file came, or could not be had (undefined): what waited for it goes. */
	placesSettled(places: Files['places']): void {
		if (!this.#places.settled) {
			this.#places = { settled: true, contents: places };
			this.#sendReady();
		}
	}

	/** `start set`, for each new start (the same object is the same start). */
	startSet(start: Start): void {
		if (start === this.#lastStart) {
			return;
		}
		this.#lastStart = start;
		this.#emit('start set', ({ cities }) => ({ method: start.method, ...startCityOf(start, cities) }), { at: this.now(), places: false });
	}

	geolocationFailed(reason: GeolocationFailure): void {
		this.send('geolocation failed', { reason });
	}

	/**
	 * «Маршрут» of the card of `point`, `rank`th in the ring's list (1 for the most famous), of the ring of `hours`:
	 * the origin's country is the last start's.
	 */
	routeOpened(point: PointOfInterest, rank: number, hours: number): void {
		const start = this.#lastStart;
		const kind = point.kind === 'city' ? 'city' : point.place.type;
		this.#emit(
			'route opened',
			({ cities }) => {
				const { start_country } = start === undefined ? {} : startCityOf(start, cities);
				return start_country === undefined ? { kind, rank, hours } : { kind, rank, hours, start_country };
			},
			{ at: this.now(), places: false },
		);
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
			this.#ringResult(ask, { answer: memory, memory: true }, { waitMs: 0, at: askedAt });
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
		this.#ringResult(pending.ask, 'answer' in ending ? { answer: ending.answer, memory: false } : ending, {
			waitMs: Math.max(0, at - pending.askedAt),
			at,
		});
	}

	/** The request under way, if any, ends `abandoned` now. */
	abandon(): void {
		const pending = this.#pending;
		if (pending === undefined) {
			return;
		}
		this.#pending = undefined;
		const now = this.now();
		this.#ringResult(pending.ask, 'abandoned', { waitMs: now - pending.askedAt, at: now });
	}

	/**
	 * The person leaves the page: the request under way is abandoned, and it and everything still waiting go by
	 * beacon, with what the files gave so far, whether posthog-js's own `pagehide` came before this one or not.
	 */
	leave(): void {
		this.#leaving = true;
		this.abandon();
		this.#leaving = false;
		const files = this.#files();
		for (const event of this.#waiting.splice(0)) {
			this.send(event.event, event.properties(files), { at: new Date(event.at), beacon: true });
		}
	}

	/** `ring result` of `ask`: how it ended, how long the person waited, and when (ms since the epoch). */
	#ringResult(ask: RingAsk, ending: Ending, { waitMs, at }: { readonly waitMs: number; readonly at: number }): void {
		const asked = {
			hours: ask.hours,
			citizenships: ask.settings.citizenships,
			held_visas: ask.settings.visas,
			wait_ms: Math.round(waitMs),
		};
		this.#emit(
			'ring result',
			(files): RingResult => ({ ...outcomeOf(ending, ask.start.origin, files), ...asked, ...startCityOf(ask.start, files.cities) }),
			{ at, places: true },
		);
	}

	/** What the files gave so far. */
	#files(): Files {
		return {
			cities: this.#cities.settled ? this.#cities.contents : undefined,
			places: this.#places.settled ? this.#places.contents : undefined,
		};
	}

	/** Whether what `event` waits for is settled. */
	#ready(event: Pick<Waiting, 'places'>): boolean {
		return this.#cities.settled && (!event.places || this.#places.settled);
	}

	/** Sends the waiting events whose files are settled, in the order they happened. */
	#sendReady(): void {
		const files = this.#files();
		const ready = this.#waiting.filter((event) => this.#ready(event));
		this.#waiting = this.#waiting.filter((event) => !this.#ready(event));
		for (const event of ready) {
			this.send(event.event, event.properties(files), { at: new Date(event.at) });
		}
	}

	/** Sends the event now if what it waits for is settled, else when it is. */
	#emit<Event extends BrowserEvent>(
		event: Event,
		properties: (files: Files) => BrowserEvents[Event],
		{ at, places }: { readonly at: number; readonly places: boolean },
	): void {
		if (this.#ready({ places })) {
			this.send(event, properties(this.#files()), this.#leaving ? { beacon: true } : undefined);
		} else {
			this.#waiting.push({ event, properties, at, places });
		}
	}
}

/** What of `ring result` its ending tells. */
type RingOutcome = Pick<RingResult, 'outcome' | 'source' | 'cities_count' | 'countries_count' | 'places_count' | 'carousel_places_count'>;

/**
 * The outcome, the source and, for a ring once the cities are known, its cities, its places once those are known too,
 * and the countries of its points of interest.
 */
function outcomeOf(ending: Ending, origin: Start['origin'], { cities, places }: Files): RingOutcome {
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
	// The points of interest as the first card counts them: the cities alone without the places file.
	const points = pointsInRing({ cities, places: places ?? [] }, { ring: answer.ring, access: answer.access, origin });
	const kinds = kindsOf(points);
	const counts: RingOutcome = { outcome: answer.outcome, source, cities_count: kinds.cities, countries_count: countOf(points).countries };
	return places === undefined ? counts : { ...counts, places_count: kinds.places, carousel_places_count: kinds.carouselPlaces };
}

/** The origin's city: the city picked in the search, else the nearest city of the file; nothing without the file. */
function startCityOf(start: Start, cities: Files['cities']): StartCity {
	const city = start.method === 'search' ? start.city : cities === undefined ? undefined : nearestCity(cities, start.origin);
	return city === undefined ? {} : { start_country: city.zone, start_city: city.name, start_city_id: city.id };
}
