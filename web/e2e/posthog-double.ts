// PostHog behind its managed proxy, the `posthog` fixture (e2e/fixtures.ts): it records the events the page sends,
// answers the remote config and the flags, and serves the SDK's lazy scripts from the installed posthog-js.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { Route } from '@playwright/test';

/** An event the page sent to PostHog. */
interface SentEvent {
	readonly event: string;
	readonly properties: Readonly<Record<string, unknown>>;
	/** Sent by `navigator.sendBeacon`, as a page going away does. */
	readonly beacon: boolean;
}

/** The remote config of the project roadtrip as PostHog served it on 2026-11-08: its settings as the SDK sees them. */
const PROJECT_CONFIG = {
	analytics: { endpoint: '/i/v0/e/' },
	autocaptureExceptions: true,
	autocapture_opt_out: false,
	captureDeadClicks: false,
	capturePerformance: { network_timing: true, web_vitals: true, web_vitals_allowed_metrics: null },
	conversations: false,
	defaultIdentifiedOnly: true,
	elementsChainAsString: true,
	errorTracking: { autocaptureExceptions: true, suppressionRules: [] },
	hasFeatureFlags: false,
	heatmaps: { captureMode: 'url_allowlist', urlAllowlist: [], urlAllowlistEnforced: false },
	logs: { captureConsoleLogs: false },
	productTours: false,
	push: { appIds: [] },
	sdkVersion: { requested: '1' },
	sessionRecording: false,
	supportedCompression: ['gzip', 'gzip-js'],
	surveys: false,
};

/** Where the installed posthog-js keeps the scripts it loads from `/static/`. */
const POSTHOG_JS_DIST = join(dirname(createRequire(import.meta.url).resolve('posthog-js/package.json')), 'dist');

/**
 * PostHog behind its managed proxy: records the events the page sends (`/e/`, `/i/v0/e/`, `/batch/`, as JSON,
 * base64 or gzip), answers the remote config with `remoteConfig` and the flags with none, and serves the SDK's lazy
 * scripts from the installed posthog-js.
 */
export class PostHogDouble {
	readonly events: SentEvent[] = [];
	/** What the project's settings say to the SDK (`/array/<token>/config`): by default the project's own. */
	remoteConfig: Record<string, unknown> = { ...PROJECT_CONFIG };

	/** The properties of each `event` sent, in order. */
	named(event: string): Readonly<Record<string, unknown>>[] {
		return this.events.filter((sent) => sent.event === event).map((sent) => sent.properties);
	}

	/** The names of the events sent, in order, without PostHog's own (`$…`). */
	get ours(): string[] {
		return this.events.map((sent) => sent.event).filter((event) => !event.startsWith('$'));
	}

	async handle(route: Route): Promise<void> {
		const request = route.request();
		const url = new URL(request.url());
		if (url.pathname.startsWith('/static/')) {
			const name = url.pathname.split('/').at(-1) ?? '';
			const file = join(POSTHOG_JS_DIST, name);
			await (existsSync(file) ? route.fulfill({ path: file, contentType: 'application/javascript' }) : route.fulfill({ status: 404 }));
			return;
		}
		const token = /^\/array\/(?<token>[^/]+)\/config(?:\.js)?$/u.exec(url.pathname)?.groups?.token;
		if (token !== undefined) {
			const json = JSON.stringify(this.remoteConfig);
			await (url.pathname.endsWith('.js')
				? route.fulfill({
						status: 200,
						contentType: 'application/javascript',
						body: `window._POSTHOG_REMOTE_CONFIG = window._POSTHOG_REMOTE_CONFIG || {}; window._POSTHOG_REMOTE_CONFIG[${JSON.stringify(token)}] = { config: ${json}, siteApps: [] };`,
					})
				: route.fulfill({ status: 200, contentType: 'application/json', body: json }));
			return;
		}
		if (url.pathname.startsWith('/flags')) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false }),
			});
			return;
		}
		const body = request.postDataBuffer();
		if (body !== null && body.length > 0) {
			// Chromium's type for `navigator.sendBeacon`.
			const beacon = request.resourceType() === 'ping';
			for (const sent of decodeEvents(body, url.searchParams.get('compression'))) {
				this.events.push({ ...sent, beacon });
			}
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
	}
}

/** The events of a body posthog-js sent: one event, a list, or `{ batch }`; gzipped or base64 by `compression`. */
function decodeEvents(body: Buffer, compression: string | null): Omit<SentEvent, 'beacon'>[] {
	let text: string;
	if (compression === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b)) {
		text = gunzipSync(body).toString('utf8');
	} else if (compression === 'base64' || body.toString('utf8').startsWith('data=')) {
		const data = new URLSearchParams(body.toString('utf8')).get('data') ?? '';
		text = Buffer.from(data, 'base64').toString('utf8');
	} else {
		text = body.toString('utf8');
	}
	const json: unknown = JSON.parse(text);
	const sent: unknown[] = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.batch) ? json.batch : [json];
	return sent.map((event) => {
		if (!isRecord(event) || typeof event.event !== 'string') {
			throw new Error(`PostHog got an event without a name: ${JSON.stringify(event)}`);
		}
		return { event: event.event, properties: isRecord(event.properties) ? event.properties : {} };
	});
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
