// posthog-js itself, a chunk of its own that posthog.ts imports as the page starts on the production host: the first
// paint does not wait for its ~140 KB (gzip). Web analytics, autocapture and errors as by default, and the screen's
// own events (events.ts).
import posthog from 'posthog-js';
// The SDK loads these two from the proxy after `init`; bundled with it, they act from its first moment: the ring
// requests carry the `X-POSTHOG-*` ids for the Worker's events and errors (the first one waits for this chunk:
// src/ring/fetch-ring.ts), and exceptions are caught.
import 'posthog-js/dist/tracing-headers.js';
import 'posthog-js/dist/exception-autocapture.js';
import type { BrowserEvent, BrowserEvents } from './events.ts';
import type { SendOptions } from './posthog.ts';

/** The project roadtrip's token (org Roadtrip, US, id 718601): it only writes events, so it is public. */
const PROJECT_TOKEN = 'phc_uvomseW3xjkV7pvWXexL6ERPQKN6P3KBQ2XXYCw83NAg';

/** PostHog's managed proxy on our domain, which ad blockers do not know. */
const PROXY = 'https://r-rt.kamyshev.me';

/**
 * Starts PostHog for `host`, the production host, and hands it the errors the page threw before. With the defaults
 * of 2026-08-30 a page view is written only when the path changes, never for the link's `#…`, and `#…` is cut from
 * every URL an event carries: the origin never reaches PostHog.
 */
export function start(host: string, earlyErrors: readonly unknown[]): void {
	posthog.init(PROJECT_TOKEN, {
		api_host: PROXY,
		ui_host: 'https://us.posthog.com',
		defaults: '2026-08-30',
		capture_exceptions: true,
		disable_session_recording: true,
		// `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` on the requests to the Worker.
		tracing_headers: [host],
	});
	for (const error of earlyErrors) {
		posthog.captureException(error);
	}
}

export function capture<Event extends BrowserEvent>(event: Event, properties: BrowserEvents[Event], { at, beacon = false }: SendOptions): void {
	posthog.capture(event, { ...properties }, { ...(at === undefined ? {} : { timestamp: at }), ...(beacon ? { transport: 'sendBeacon', send_instantly: true } : {}) });
}
