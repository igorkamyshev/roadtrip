// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (`RingApi` of e2e/ring-api.ts, a
// scripted double that records every request and answers or holds it), the basemap's tiles (`GET /tiles/{z}/{x}/{y}`,
// each one empty), the dataset's zone outlines (`/data/zones.json`, `ZONE_OUTLINES`) and cities (`/data/cities.json`,
// `CITIES`, or a test's own through `serveCities`), PostHog behind its proxy (`PostHogDouble` of
// e2e/posthog-double.ts, the `posthog` fixture), and every other host, which is cut off in every test so that none
// reaches the network. The production host is the preview server under the production name (`openInProduction`),
// where the build runs PostHog. The basemap's fonts and sprites are the client's own static assets. Geolocation and
// time come from Playwright itself (context permissions, `page.clock`; `failGeolocation` for a failure other than a
// refusal).
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { encodeCities, type CityRow } from 'data/cities-file';
import type { Access, RingAnswer, RingResponse } from 'worker/api';
import { PostHogDouble } from './posthog-double.ts';
import { RingApi } from './ring-api.ts';
import { keepMapForTests } from './screen.ts';

export { expect };

type Position = [lon: number, lat: number];

/** A square of `size` degrees with its south-west corner at `corner`, as a zone's outline. */
function squareZone(zone: string, [lon, lat]: Position, size = 1) {
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
		squareZone('ALB', [19.5, 40.5]),
		squareZone('BIH', [17.5, 43.5]),
		squareZone('CRIMEA', [33.5, 44.5]),
		squareZone('HUN', [19.5, 46.5]),
		squareZone('SRB', [20, 44]),
		squareZone('UKR', [30, 48], 3),
	],
};

/**
 * The cities of the file the Worker serves at `/data/cities.json` (data's `build-cities`, `encodeCities`): real
 * cities of GeoNames around Belgrade, biggest first, as [id, ru, local, lat, lon, population, zone], none a part of
 * another (GLOSSARY «Часть города»). Lukavac has no Russian name here.
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
	[785756, 'Смедерево', 'Smederevo', 44.664, 20.928, 62_000, 'SRB'],
	[3188402, 'Валево', 'Valjevo', 44.275, 19.898, 61_035, 'SRB'],
	[3191376, 'Шабац', 'Šabac', 44.747, 19.69, 55_114, 'SRB'],
	[3196079, '', 'Lukavac', 44.542, 18.526, 44_520, 'BIH'],
];

/**
 * The production host. The screen opened there (`openInProduction`) is the very build of the other tests, served by
 * the same preview server, but runs PostHog as it does in production: nothing in the client knows it is a test.
 */
export const PRODUCTION = 'https://roadtrip.kamyshev.me';

/** PostHog's managed proxy, where the browser sends its events (`PostHogDouble`). */
export const POSTHOG_PROXY = 'https://r-rt.kamyshev.me';

const PHONE_USER_AGENT =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';

/** What the page asked of the network: the basemap's tiles it got, and the requests to other hosts, cut off. */
interface Network {
	readonly tiles: URL[];
	readonly blocked: string[];
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
			const network: Network = { tiles: [], blocked: [] };
			await cutOffTheNetwork(context, network, baseURL ?? '');
			await keepMapForTests(context);
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
			Object.defineProperty(Navigator.prototype, 'userAgentData', { value: undefined });
		}, PHONE_USER_AGENT);
		await use(posthog);
	},
});

/** Opens the screen on the production host, where PostHog runs: `path` is the rest of the URL, as `/#/?p=…`. */
export async function openInProduction(page: Page, path = '/'): Promise<void> {
	await page.goto(`${PRODUCTION}${path}`);
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
	await context.addInitScript(
		(code) => {
			const error = { code, message: 'test', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
			navigator.geolocation.getCurrentPosition = (_, fail) => {
				setTimeout(() => fail?.(error), 0);
			};
		},
		reason === 'unavailable' ? 2 : 3,
	);
}

/** A Russian's entry mode in Serbia, the start country. */
const RUSSIAN_IN_SERBIA: Access = { SRB: { mode: 'visa_free', citizenship: 'RUS' } };

/**
 * What the visa rules add to an answer: `access` (by default a Russian's in Serbia, the start country) and when they
 * came from Sherpa (by default just now).
 */
export function visaRules(
	access: Access = RUSSIAN_IN_SERBIA,
	loadedAt = new Date().toISOString(),
): Pick<RingAnswer, 'access' | 'visaRulesLoadedAt'> {
	return { access, visaRulesLoadedAt: loadedAt };
}

/**
 * A ring as the API sends it: a square band around (lat, lon) between `inner` and `outer` degrees from it, a
 * MultiPolygon with a hole (no hole for inner 0).
 */
export function squareRing(
	lat: number,
	lon: number,
	[inner, outer]: readonly [inner: number, outer: number],
): Extract<RingResponse, { outcome: 'ring' }> {
	const square = (d: number): Position[] => [
		[lon - d, lat - d],
		[lon + d, lat - d],
		[lon + d, lat + d],
		[lon - d, lat + d],
		[lon - d, lat - d],
	];
	const polygon = inner === 0 ? [square(outer)] : [square(outer), square(inner).toReversed()];
	return {
		outcome: 'ring',
		ring: { type: 'MultiPolygon', coordinates: [polygon] },
		startCountry: 'SRB',
		source: 'calculation',
		...visaRules(),
	};
}

/** Every country around Serbia open to a Russian with a Schengen visa, Kosovo closed. */
const AROUND_SERBIA_WITH_SCHENGEN: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'held_visa', visa: 'SCHENGEN' },
	ROU: { mode: 'held_visa', visa: 'SCHENGEN' },
	HRV: { mode: 'held_visa', visa: 'SCHENGEN' },
	RKS: { mode: 'closed', closedForEveryone: true },
};

/**
 * The ring of the carousel's tests, 2–3 h around Belgrade (`openTheCarousel` of e2e/screen.ts): a band from 1° to 3°
 * with every country around open, which holds 12 city cards and «и ещё», a row that scrolls on every window.
 */
export const carouselRing = (): RingResponse => ({ ...squareRing(44.8176, 20.4573, [1, 3]), ...visaRules(AROUND_SERBIA_WITH_SCHENGEN) });
