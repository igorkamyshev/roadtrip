// posthog-js in the browser (spec «Аналитика и ошибки», «Браузер»; research/posthog-cloudflare): web analytics,
// autocapture and errors as by default, and the screen's own events (events.ts). Only on the production host: off it
// (`vite dev`, `vite preview`, a copy of the site) nothing is initialised and nothing leaves the page.
import posthog from 'posthog-js';
// The SDK loads these two from the proxy after `init`; bundled, they act from the first moment: the first ring request
// of a load carries the `X-POSTHOG-*` ids for the Worker's events and errors, and an error while the page loads is caught.
import 'posthog-js/dist/tracing-headers.js';
import 'posthog-js/dist/exception-autocapture.js';
import { PRODUCTION_HOST } from 'worker/api';
import type { BrowserEvent, BrowserEvents } from './events.ts';

/** The project roadtrip's token (org Roadtrip, US, id 718601): it only writes events, so it is public. */
const PROJECT_TOKEN = 'phc_uvomseW3xjkV7pvWXexL6ERPQKN6P3KBQ2XXYCw83NAg';

/** PostHog's managed proxy on our domain, which ad blockers do not know. */
const PROXY = 'https://r-rt.kamyshev.me';

let started = false;

/**
 * Starts PostHog when the page is on the production host, before anything else of the screen runs, so that its
 * errors are caught. With the defaults of 2026-08-30 a page view is written only when the path changes, never for the
 * link's `#…`, and `#…` is cut from every URL an event carries: the origin never reaches PostHog.
 */
export function startAnalytics(hostname: string): void {
	if (hostname !== PRODUCTION_HOST || started) {
		return;
	}
	posthog.init(PROJECT_TOKEN, {
		api_host: PROXY,
		ui_host: 'https://us.posthog.com',
		defaults: '2026-08-30',
		capture_exceptions: true,
		disable_session_recording: true,
		// `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` on the requests to the Worker.
		tracing_headers: [PRODUCTION_HOST],
	});
	started = true;
}

export interface SendOptions {
	/** When it happened, if before the send: a ring's outcome waits for the cities file. */
	readonly at?: Date;
	/** The page is going away: the event leaves at once by `sendBeacon`. */
	readonly beacon?: boolean;
}

/** Sends one of the screen's events; nothing off the production host. */
export function send<Event extends BrowserEvent>(event: Event, properties: BrowserEvents[Event], { at, beacon = false }: SendOptions = {}): void {
	if (!started) {
		return;
	}
	posthog.capture(event, { ...properties }, { ...(at === undefined ? {} : { timestamp: at }), ...(beacon ? { transport: 'sendBeacon', send_instantly: true } : {}) });
}
