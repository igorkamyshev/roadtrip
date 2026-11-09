// PostHog in the browser (spec #20 «Аналитика и ошибки», «Браузер»; research/posthog-cloudflare): only on the
// production host. Off it (`vite dev`, `vite preview`, a copy of the site) nothing is loaded and nothing leaves the
// page. On it, posthog-js comes as a chunk of its own (posthog-client.ts) that the page imports as it starts, so the
// first paint does not wait for it; until it is up, this keeps the screen's events with their time and the errors the
// page throws, and the ring requests wait for it (`analyticsStarted`), so that even the first one carries its tracing
// headers.
import { PRODUCTION_HOST } from 'worker/api';
import type { BrowserEvent, BrowserEvents } from './events.ts';

type Client = typeof import('./posthog-client.ts');

export interface SendOptions {
	/** When it happened, if before the send: a ring's outcome waits for the cities file. */
	readonly at?: Date;
	/** The page is going away: the event leaves at once by `sendBeacon`. */
	readonly beacon?: boolean;
}

let client: Client | undefined;
/** The sends waiting for the client; undefined until PostHog is started. */
let waiting: ((loaded: Client) => void)[] | undefined;
let started: Promise<void> = Promise.resolve();

/**
 * Starts PostHog when the page is on the production host, before anything else of the screen runs, so that the
 * errors of what follows are caught, by PostHog or by the listeners here until it is up.
 */
export function startAnalytics(hostname: string): void {
	if (hostname !== PRODUCTION_HOST || waiting !== undefined) {
		return;
	}
	const queue: ((loaded: Client) => void)[] = [];
	waiting = queue;
	started = loadClient(queue, keepErrors());
}

/** Imports posthog-js, starts it with the errors kept so far, and runs the sends that waited for it. */
async function loadClient(queue: ((loaded: Client) => void)[], early: KeptErrors): Promise<void> {
	let loaded: Client;
	try {
		loaded = await import('./posthog-client.ts');
	} catch {
		// The chunk could not come (the network, a blocker): nothing is sent, and the ring requests go without ids.
		early.stop();
		queue.length = 0;
		return;
	}
	loaded.start(PRODUCTION_HOST, early.stop());
	client = loaded;
	for (const run of queue.splice(0)) {
		run(loaded);
	}
}

/** Resolves once PostHog is up on the production host or could not be, at once anywhere else. */
export function analyticsStarted(): Promise<void> {
	return started;
}

/**
 * Sends one of the screen's events; nothing off the production host. Before posthog-js is up, the event waits for it
 * with the time it happened, but for a beacon of a page going away, which cannot wait.
 */
export function send<Event extends BrowserEvent>(event: Event, properties: BrowserEvents[Event], options: SendOptions = {}): void {
	if (client !== undefined) {
		client.capture(event, properties, options);
		return;
	}
	if (waiting === undefined || options.beacon === true) {
		return;
	}
	const at = options.at ?? new Date();
	waiting.push((loaded) => {
		loaded.capture(event, properties, { at });
	});
}

interface KeptErrors {
	/** Stops keeping them and gives them. */
	readonly stop: () => unknown[];
}

/** Keeps the errors the page throws and its rejections nobody handles, until `stop`, which gives them. */
function keepErrors(): KeptErrors {
	const errors: unknown[] = [];
	const onError = (event: ErrorEvent) => {
		errors.push(event.error ?? new Error(event.message));
	};
	const onRejection = (event: PromiseRejectionEvent) => {
		errors.push(event.reason);
	};
	window.addEventListener('error', onError);
	window.addEventListener('unhandledrejection', onRejection);
	return {
		stop() {
			window.removeEventListener('error', onError);
			window.removeEventListener('unhandledrejection', onRejection);
			return errors.splice(0);
		},
	};
}
