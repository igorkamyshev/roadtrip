// The screen's own events in PostHog (spec #20 «Аналитика и ошибки», «Свои события браузера»; decision #18): what the
// person saw. Never the origin: a place is only the nearest city of the cities file and its country.
import type { RingResponse, RingSource } from 'worker/api';
import type { GeolocationFailure } from '../start/geolocation.ts';
import type { StartMethod } from '../start/start.ts';

/** Where the origin is, as the events say it; empty when the cities file could not be had. */
export interface Place {
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

export interface RingResult extends Place {
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
	/** The ring's cities and their countries, as the first card counts them: for `ring`, once the cities file came. */
	readonly cities_count?: number;
	readonly countries_count?: number;
}

export interface BrowserEvents {
	/** The origin was set, by any way, on load too. */
	'start set': Place & { readonly method: StartMethod };
	'geolocation failed': { readonly reason: GeolocationFailure };
	/** Exactly one for each ring request: the slider let go, other settings or another origin, the load. */
	'ring result': RingResult;
	/** A load whose `#…` holds a state while the browser has none saved. */
	'link opened': Readonly<Record<string, never>>;
}

export type BrowserEvent = keyof BrowserEvents;
