// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (a scripted double that records
// every request and answers or holds it), the basemap's tiles (`GET /tiles/{z}/{x}/{y}`, each one empty), the
// dataset's zone outlines (`/data/zones.json`, `ZONE_OUTLINES`) and cities (`/data/cities.json`, `CITIES`, or a
// test's own through `serveCities`), PostHog behind its proxy (`PostHogDouble`, the `posthog` fixture), and every
// other host, which is cut off in every test so that none reaches the network. The production host is the preview
// server under the production name (`openInProduction`), where the build runs PostHog. The basemap's fonts and
// sprites are the client's own static assets. Geolocation and time come from Playwright itself (context
// permissions, `page.clock`; `failGeolocation` for a failure other than a refusal).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { encodeCities, type CityRow } from 'data/cities-file';
import type { Access, RingResponse } from 'worker/api';

export { expect };

/** A request to `GET /api/ring`, as the screen sent it. */
export interface RingCall {
	readonly lat: string;
	readonly lon: string;
	readonly hours: number;
	readonly cit: string | null;
	readonly visas: string | null;
	readonly query: string;
	/** Its headers, lowercase: PostHog's `x-posthog-*` among them on the production host. */
	readonly headers: Readonly<Record<string, string>>;
}

/** How the double answers: 200 with a body, another status, or a dropped connection. */
export type RingReply = RingResponse | { readonly status: number } | 'network error';

/** Answers to a call, or undefined to hold it until the test calls `answer`. */
export type RingResponder = (call: RingCall) => RingReply | undefined;

export class RingApi {
	readonly calls: RingCall[] = [];
	#held: { call: RingCall; route: Route }[] = [];
	#responder: RingResponder = () => undefined;

	/** How every next call is answered; by default each one is held. */
	respond(responder: RingResponder): void {
		this.#responder = responder;
	}

	/** Answers the oldest held call (or the held call for `hours`). */
	async answer(reply: RingReply, hours?: number): Promise<RingCall> {
		await expect.poll(() => this.#held.some((held) => hours === undefined || held.call.hours === hours)).toBe(true);
		const index = this.#held.findIndex((held) => hours === undefined || held.call.hours === hours);
		const [{ call, route }] = this.#held.splice(index, 1);
		await fulfil(route, reply);
		return call;
	}

	/** Resolves once the screen has sent `count` calls in all. */
	async waitForCalls(count: number): Promise<RingCall[]> {
		await expect.poll(() => this.calls.length, { message: `${count} calls to /api/ring` }).toBeGreaterThanOrEqual(count);
		return this.calls;
	}

	async handle(route: Route): Promise<void> {
		const url = new URL(route.request().url());
		const call: RingCall = {
			lat: url.searchParams.get('lat') ?? '',
			lon: url.searchParams.get('lon') ?? '',
			hours: Number(url.searchParams.get('hours')),
			cit: url.searchParams.get('cit'),
			visas: url.searchParams.get('visas'),
			query: url.search,
			headers: route.request().headers(),
		};
		this.calls.push(call);
		const reply = this.#responder(call);
		if (reply === undefined) {
			this.#held.push({ call, route });
			return;
		}
		await fulfil(route, reply);
	}
}

async function fulfil(route: Route, reply: RingReply): Promise<void> {
	if (reply === 'network error') {
		await route.abort('connectionreset');
	} else if ('outcome' in reply) {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
	} else {
		await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify({ error: 'double' }) });
	}
}

/** A square of `size` degrees with its south-west corner at (lon, lat), as a zone's outline. */
function squareZone(zone: string, lon: number, lat: number, size = 1) {
	const ring = [
		[lon, lat],
		[lon + size, lat],
		[lon + size, lat + size],
		[lon, lat + size],
		[lon, lat],
	];
	return { type: 'Feature' as const, properties: { zone }, geometry: { type: 'MultiPolygon' as const, coordinates: [[ring]] } };
}

/**
 * The zone outlines the Worker serves at `/data/zones.json` (data's `zoneOutlines`), as squares around Belgrade:
 * a few countries and a closed territory, enough to hatch.
 */
export const ZONE_OUTLINES = {
	type: 'FeatureCollection' as const,
	features: [
		squareZone('ALB', 19.5, 40.5),
		squareZone('BIH', 17.5, 43.5),
		squareZone('CRIMEA', 33.5, 44.5),
		squareZone('HUN', 19.5, 46.5),
		squareZone('SRB', 20, 44),
		squareZone('UKR', 30, 48, 3),
	],
};

/**
 * The cities of the file the Worker serves at `/data/cities.json` (data's `build-cities`, `encodeCities`): real
 * cities of GeoNames around Belgrade, biggest first, as [id, ru, local, lat, lon, population, zone]. Ilidža has no
 * Russian name here.
 */
export const CITIES: readonly CityRow[] = [
	[3054643, 'Будапешт', 'Budapest', 47.498, 19.04, 1_741_041, 'HUN'],
	[792680, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
	[3191281, 'Сараево', 'Sarajevo', 43.849, 18.356, 696_731, 'BIH'],
	[786714, 'Приштина', 'Pristina', 42.673, 21.167, 550_000, 'RKS'],
	[665087, 'Тимишоара', 'Timişoara', 45.754, 21.226, 250_849, 'ROU'],
	[787657, 'Ниш', 'Niš', 43.325, 21.903, 250_000, 'SRB'],
	[3193044, 'Подгорица', 'Podgorica', 42.441, 19.263, 236_852, 'MNE'],
	[3194360, 'Нови-Сад', 'Novi Sad', 45.252, 19.837, 215_400, 'SRB'],
	[721472, 'Дебрецен', 'Debrecen', 47.532, 21.624, 202_402, 'HUN'],
	[686254, 'Арад', 'Arad', 46.183, 21.317, 169_065, 'ROU'],
	[715429, 'Сегед', 'Szeged', 46.253, 20.148, 160_766, 'HUN'],
	[789128, 'Крагуевац', 'Kragujevac', 44.017, 20.917, 147_473, 'SRB'],
	[3046526, 'Печ', 'Pécs', 46.076, 18.228, 145_347, 'HUN'],
	[3188582, 'Тузла', 'Tuzla', 44.538, 18.667, 142_486, 'BIH'],
	[3050434, 'Кечкемет', 'Kecskemét', 46.906, 19.691, 109_847, 'HUN'],
	[3194828, 'Мостар', 'Mostar', 43.343, 17.808, 104_518, 'BIH'],
	[3189595, 'Суботица', 'Subotica', 46.1, 19.667, 100_000, 'SRB'],
	[668954, 'Решица', 'Reşiţa', 45.301, 21.889, 81_228, 'ROU'],
	[678817, 'Дробета-Турну-Северин', 'Drobeta-Turnu Severin', 44.627, 22.653, 79_865, 'ROU'],
	[783814, 'Зренянин', 'Zrenjanin', 45.384, 20.382, 79_773, 'SRB'],
	[787237, 'Панчево', 'Pančevo', 44.872, 20.642, 76_654, 'SRB'],
	[3193935, 'Осиек', 'Osijek', 45.551, 18.694, 75_535, 'HRV'],
	[3199145, '', 'Ilidža', 43.831, 18.307, 71_277, 'BIH'],
	[785756, 'Смедерево', 'Smederevo', 44.664, 20.928, 62_000, 'SRB'],
	[3188402, 'Валево', 'Valjevo', 44.275, 19.898, 61_035, 'SRB'],
	[3191376, 'Шабац', 'Šabac', 44.747, 19.69, 55_114, 'SRB'],
];

/**
 * The production host. The screen opened there (`openInProduction`) is the very build of the other tests, served by
 * the same preview server, but runs PostHog as it does in production: nothing in the client knows it is a test.
 */
export const PRODUCTION = 'https://roadtrip.kamyshev.me';

/** PostHog's managed proxy, where the browser sends its events (`PostHogDouble`). */
export const POSTHOG_PROXY = 'https://r-rt.kamyshev.me';

const PHONE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

/** What the page asked of the network: the basemap's tiles it got, and the requests to other hosts, cut off. */
export class Network {
	readonly tiles: URL[] = [];
	readonly blocked: string[] = [];
}

/** The headers of a body as it was sent, which `fetch` has decoded. */
const DECODED_BODY_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

async function cutOffTheNetwork(context: BrowserContext, network: Network, preview: string): Promise<void> {
	// Routes run newest first; the catch-all lets the page's own host through to the routes before it, and this one,
	// the oldest, answers what is left on the production host from the preview server.
	await context.route(`${PRODUCTION}/**`, async (route) => {
		const request = route.request();
		const { pathname, search } = new URL(request.url());
		// Node's own fetch, not the context's (`context.request`): its answers are disposed as the context closes, and a
		// request the page still makes as a test ends (a glyph of the basemap) would fail the test with «Fetch response
		// has been disposed». A route still running then is no matter to Playwright, which drops its `fulfill`.
		const response = await fetch(new URL(pathname + search, preview), { method: request.method(), headers: request.headers() });
		// fetch decodes the body, so its encoding and length do not go with it.
		const headers: Record<string, string> = {};
		response.headers.forEach((value, name) => {
			if (!DECODED_BODY_HEADERS.has(name)) {
				headers[name] = value;
			}
		});
		await route.fulfill({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
	});
	await context.route('**/tiles/**', async (route) => {
		network.tiles.push(new URL(route.request().url()));
		// An empty vector tile: a basemap with nothing on it.
		await route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
	});
	await context.route('**/data/zones.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONE_OUTLINES) }),
	);
	await context.route('**/data/cities.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(encodeCities(CITIES)) }),
	);
	await context.route('**/*', async (route) => {
		const { hostname, origin } = new URL(route.request().url());
		if (hostname === 'localhost' || origin === PRODUCTION) {
			await route.fallback();
			return;
		}
		network.blocked.push(route.request().url());
		await route.abort('blockedbyclient');
	});
}

export const test = base.extend<{ network: Network; ringApi: RingApi; posthog: PostHogDouble }>({
	network: [
		async ({ context, baseURL }, use) => {
			const network = new Network();
			await cutOffTheNetwork(context, network, baseURL ?? '');
			// The map the client announces (`MAP_EVENT` of src/map/map-view.tsx), kept for e2e/screen.ts.
			await context.addInitScript(() => {
				window.addEventListener('roadtrip:map', (event) => {
					(window as unknown as { __roadtripMap?: unknown }).__roadtripMap = (event as CustomEvent).detail;
				});
			});
			await use(network);
		},
		{ auto: true },
	],
	ringApi: async ({ context }, use) => {
		const ringApi = new RingApi();
		await context.route('**/api/ring?*', (route) => ringApi.handle(route));
		await use(ringApi);
	},
	posthog: async ({ context }, use) => {
		const posthog = new PostHogDouble();
		await context.route(`${POSTHOG_PROXY}/**`, (route) => posthog.handle(route));
		// posthog-js drops the events of a browser that looks automated (Headless in the user agent or its brands,
		// `navigator.webdriver`): the page sees a person's phone.
		await context.addInitScript((userAgent) => {
			Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
			Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => userAgent });
			Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
		}, PHONE_USER_AGENT);
		await use(posthog);
	},
});

/** Opens the screen on the production host, where PostHog runs: `path` is the rest of the URL, as `/#/?p=…`. */
export async function openInProduction(page: Page, path = '/'): Promise<void> {
	await page.goto(`${PRODUCTION}${path}`);
}

/** An event the page sent to PostHog. */
export interface SentEvent {
	readonly event: string;
	readonly properties: Readonly<Record<string, unknown>>;
	/** Sent by `navigator.sendBeacon`, as a page going away does. */
	readonly beacon: boolean;
}

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
		const config = /^\/array\/(?<token>[^/]+)\/config(?<script>\.js)?$/u.exec(url.pathname)?.groups;
		if (config !== undefined) {
			const json = JSON.stringify(this.remoteConfig);
			await (config.script === undefined
				? route.fulfill({ status: 200, contentType: 'application/json', body: json })
				: route.fulfill({
						status: 200,
						contentType: 'application/javascript',
						body: `window._POSTHOG_REMOTE_CONFIG = window._POSTHOG_REMOTE_CONFIG || {}; window._POSTHOG_REMOTE_CONFIG[${JSON.stringify(config.token)}] = { config: ${json}, siteApps: [] };`,
					}));
			return;
		}
		if (url.pathname.startsWith('/flags')) {
			await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false }) });
			return;
		}
		const body = request.postDataBuffer();
		if (body !== null && body.length > 0) {
			// Chromium's type for `navigator.sendBeacon`.
			const beacon = request.resourceType() === 'ping';
			for (const sent of decodeEvents(body, url.searchParams.get('compression'))) {
				this.events.push({ event: sent.event, properties: sent.properties ?? {}, beacon });
			}
		}
		await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
	}
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

/** The events of a body posthog-js sent: one event, a list, or `{ batch }`; gzipped or base64 by `compression`. */
function decodeEvents(body: Buffer, compression: string | null): { event: string; properties?: Record<string, unknown> }[] {
	let text: string;
	if (compression === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b)) {
		text = gunzipSync(body).toString('utf8');
	} else if (compression === 'base64' || body.toString('utf8').startsWith('data=')) {
		const data = new URLSearchParams(body.toString('utf8')).get('data') ?? '';
		text = Buffer.from(data, 'base64').toString('utf8');
	} else {
		text = body.toString('utf8');
	}
	const json = JSON.parse(text) as unknown;
	const events = Array.isArray(json) ? json : typeof json === 'object' && json !== null && 'batch' in json ? (json as { batch: unknown[] }).batch : [json];
	return events as { event: string; properties?: Record<string, unknown> }[];
}

/** Serves the page `cities` as the cities file instead of `CITIES`. */
export async function serveCities(page: Page, cities: readonly CityRow[]): Promise<void> {
	await page.route('**/data/cities.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(encodeCities(cities)) }),
	);
}

/** Lets the page read the position `at`, as a person who allowed geolocation. */
export async function allowGeolocation(context: BrowserContext, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await context.setGeolocation({ latitude: at.lat, longitude: at.lon });
	await context.grantPermissions(['geolocation']);
}

/**
 * Makes the browser fail to give a position for `reason`, as a phone without a fix (`unavailable`) or one too slow
 * (`timeout`). A refusal (`denied`) needs nothing: a context without the permission refuses.
 */
export async function failGeolocation(context: BrowserContext, reason: 'unavailable' | 'timeout'): Promise<void> {
	await context.addInitScript((code) => {
		const error = { code, message: 'test', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
		navigator.geolocation.getCurrentPosition = (_, fail) => {
			setTimeout(() => fail?.(error), 0);
		};
	}, reason === 'unavailable' ? 2 : 3);
}

/**
 * What the visa rules add to an answer: `access` (by default a Russian's in Serbia, the start country) and when they
 * came from Sherpa (by default just now).
 */
export function visaRules(access: Access = { SRB: { mode: 'visa_free', citizenship: 'RUS' } }, loadedAt = new Date().toISOString()) {
	return { access, visaRulesLoadedAt: loadedAt };
}

type Position = [lon: number, lat: number];

/**
 * A ring as the API sends it: a square band around (lat, lon) between `inner` and `outer` degrees from it, a
 * MultiPolygon with a hole (no hole for inner 0).
 */
export function squareRing(lat: number, lon: number, inner: number, outer: number): Extract<RingResponse, { outcome: 'ring' }> {
	const square = (d: number): Position[] => [
		[lon - d, lat - d],
		[lon + d, lat - d],
		[lon + d, lat + d],
		[lon - d, lat + d],
		[lon - d, lat - d],
	];
	const polygon = inner === 0 ? [square(outer)] : [square(outer), square(inner).reverse()];
	return { outcome: 'ring', ring: { type: 'MultiPolygon', coordinates: [polygon] }, startCountry: 'SRB', source: 'calculation', ...visaRules() };
}
