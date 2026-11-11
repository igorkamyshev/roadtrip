// The screen's own events in PostHog (spec #20 «Аналитика и ошибки», «Свои события браузера»; decision #18): what the
// person saw. Never the origin: only its city, the nearest city of the cities file, and its country.
import type { PlaceType } from 'data/places-file';
import type { RingResponse, RingSource } from 'worker/api';
import type { GeolocationFailure } from '../start/geolocation.ts';
import type { StartMethod } from '../start/start.ts';

/**
 * The origin's city as the events say it: the nearest city of the cities file, wherever it is (not GLOSSARY «Город
 * точки старта», which only a city whose limits hold the origin is), or the city picked in the search; empty when the
 * cities file could not be had.
 */
export interface StartCity {
	/** The nearest city's country: alpha-3, `NX` for Northern Cyprus, or a closed territory's code. */
	readonly start_country?: string;
	/** Its Russian name, else the local one. */
	readonly start_city?: string;
	/** Its GeoNames id. */
	readonly start_city_id?: number;
}

/**
 * How a ring request ended (decision #18): the Worker's `outcome`, or the browser's own: the WAF's block, a failure, or
 * a request left before its answer.
 */
export type RingResultOutcome = RingResponse['outcome'] | 'too_many_requests' | 'error' | 'abandoned';

/** Where the ring came from: the browser's memory, or the Worker's `source`. */
export type RingResultSource = 'memory' | RingSource;

export interface RingResult extends StartCity {
	readonly outcome: RingResultOutcome;
	/** The ring's upper bound in hours: N, or worker/api's HOURS_PER_DAY·D for day D (#83), which names the slider's cell alone. */
	readonly hours: number;
	/** Sorted alpha-3. */
	readonly citizenships: readonly string[];
	/** Sorted: alpha-3 and `SCHENGEN`. */
	readonly held_visas: readonly string[];
	/** Absent when nothing came: `visa_rules_missing`, a failure, `abandoned`. */
	readonly source?: RingResultSource;
	/** From the request to its outcome; 0 from memory. */
	readonly wait_ms: number;
	/**
	 * For `ring`, once the cities file came: the ring's cities alone, and the countries of its points of interest as the
	 * first card counts them, of the cities alone when the places file could not be had.
	 */
	readonly cities_count?: number;
	readonly countries_count?: number;
	/**
	 * For `ring`, once the cities file and the places file came (spec #154 «События (PostHog)»): the ring's places, and
	 * how many of them are among the carousel's cards (`CAROUSEL_POINTS` first points of interest), which the places'
	 * weight is tuned by. Absent without the places file.
	 */
	readonly places_count?: number;
	readonly carousel_places_count?: number;
}

/**
 * «Маршрут» of a card was tapped (spec #154 «События (PostHog)»): what the point of interest is and where it stands in
 * the ring's list, never its name or id.
 */
export interface RouteOpened {
	/** `city`, or the place's type. */
	readonly kind: 'city' | PlaceType;
	/** Its place in the ring's list of points of interest, the most famous first: 1 for the first card's. */
	readonly rank: number;
	/** The ring's upper bound in hours, as in `ring result`. */
	readonly hours: number;
	/** The origin's city's country, as in `start set`; absent without the cities file. */
	readonly start_country?: string;
}

export interface BrowserEvents {
	/** The origin was set, by any way, on load too. */
	'start set': StartCity & { readonly method: StartMethod };
	'geolocation failed': { readonly reason: GeolocationFailure };
	/** Exactly one for each ring request: the slider let go, other settings or another origin, the load. */
	'ring result': RingResult;
	/** A load whose `#…` holds a state while the browser has none saved. */
	'link opened': Readonly<Record<string, never>>;
	'route opened': RouteOpened;
}

export type BrowserEvent = keyof BrowserEvents;
