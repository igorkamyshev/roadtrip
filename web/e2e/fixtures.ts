// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (`RingApi` of e2e/ring-api.ts, a
// scripted double that records every request and answers or holds it), the basemap's tiles (`GET /tiles/{z}/{x}/{y}`,
// each one empty), the dataset's zone outlines (`/data/zones.json`, `ZONE_OUTLINES`), cities (`/data/cities.json`,
// `CITIES`, or a test's own through `serveCities`) and places (`/data/places.json`, `PLACES`, or a test's own or none
// through `servePlaces`) and the cells of the places' outlines (`/data/place-outlines/`, `PLACE_OUTLINES`, or a test's
// own or none through `servePlaceOutlines`), PostHog behind its proxy (`PostHogDouble` of
// e2e/posthog-double.ts, the `posthog` fixture), and every other host, which is cut off in every test so that none
// reaches the network. The production host is the preview server under the production name (`openInProduction`),
// where the build runs PostHog. The basemap's fonts and sprites are the client's own static assets. Geolocation and
// time come from Playwright itself (context permissions, `page.clock`; `failGeolocation` for a failure other than a
// refusal).
import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { encodeCities, type CityRow } from 'data/cities-file';
import {
	encodePlaceOutlines,
	encodePlaces,
	placeOutlinesCell,
	type Place,
	type PlaceOutline,
	type PlaceOutlinesFile,
} from 'data/places-file';
import type { Access, RingAnswer, RingResponse } from 'worker/api';
import { PostHogDouble } from './posthog-double.ts';
import { RingApi } from './ring-api.ts';
import { FROM_BELGRADE, keepMapForTests } from './screen.ts';

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
 * The places of the file the Worker serves at `/data/places.json` (data's `build-places`, `encodePlaces`): real places
 * around Belgrade, their Q-ids, names, points, sitelinks and types Wikidata's (#148's research), their access points
 * (GLOSSARY «Подъезд») picked by hand on roads near them. Balaton and Đerdap are large, with access points along their
 * shores far apart; the lake of Zvornik is on the border, with one in Bosnia and Herzegovina and one in Serbia, the
 * Bosnian one nearer Belgrade. Vjetrenica has no Russian name, and as many sitelinks as Lepenski Vir.
 */
export const PLACES: readonly Place[] = [
	{
		qid: 6383,
		ru: 'Балатон',
		local: 'Lake Balaton',
		lat: 46.85,
		lon: 17.72,
		sitelinks: 97,
		type: 'lake',
		// Siófok, Keszthely.
		access: [
			{ lat: 46.905, lon: 18.058, zone: 'HUN' },
			{ lat: 46.765, lon: 17.247, zone: 'HUN' },
		],
	},
	{
		qid: 61757,
		ru: 'Хортобадь',
		local: 'Hortobágy National Park',
		lat: 47.5946,
		lon: 21.1568,
		sitelinks: 54,
		type: 'national-park',
		access: [{ lat: 47.583, lon: 21.151, zone: 'HUN' }],
	},
	{
		qid: 143042,
		ru: 'Монастырь Студеница',
		local: 'Studenica Monastery',
		lat: 43.4867,
		lon: 20.5316,
		sitelinks: 44,
		type: 'monastery',
		access: [{ lat: 43.486, lon: 20.533, zone: 'SRB' }],
	},
	{
		qid: 129979,
		ru: 'Делиблатские пески',
		local: 'Deliblato Sands',
		lat: 44.9647,
		lon: 21.0142,
		sitelinks: 34,
		type: 'national-park',
		access: [
			{ lat: 44.93, lon: 20.99, zone: 'SRB' },
			{ lat: 45.05, lon: 21.15, zone: 'SRB' },
		],
	},
	{
		qid: 1258055,
		ru: 'Джердап',
		local: 'Đerdap National Park',
		lat: 44.6667,
		lon: 22.5167,
		sitelinks: 32,
		type: 'national-park',
		// Golubac, Donji Milanovac, Tekija.
		access: [
			{ lat: 44.664, lon: 21.676, zone: 'SRB' },
			{ lat: 44.618, lon: 22.163, zone: 'SRB' },
			{ lat: 44.55, lon: 22.41, zone: 'SRB' },
		],
	},
	{
		qid: 906669,
		ru: 'Лепенски-Вир',
		local: 'Lepenski Vir',
		lat: 44.5611,
		lon: 22.0242,
		sitelinks: 29,
		type: 'ruins',
		access: [{ lat: 44.557, lon: 22.026, zone: 'SRB' }],
	},
	{
		qid: 2880621,
		ru: '',
		local: 'Vjetrenica',
		lat: 42.8458,
		lon: 17.9839,
		sitelinks: 29,
		type: 'cave',
		access: [{ lat: 42.847, lon: 17.985, zone: 'BIH' }],
	},
	{
		qid: 1264703,
		ru: 'Монастырь Манасия',
		local: 'Manasija',
		lat: 44.1009,
		lon: 21.4696,
		sitelinks: 25,
		type: 'monastery',
		access: [{ lat: 44.098, lon: 21.466, zone: 'SRB' }],
	},
	{
		qid: 12759913,
		ru: 'Тара',
		local: 'Tara',
		lat: 43.8483,
		lon: 19.4594,
		sitelinks: 22,
		type: 'mountain',
		access: [{ lat: 43.89, lon: 19.52, zone: 'SRB' }],
	},
	{
		qid: 231499,
		ru: 'Зворничко-езеро',
		local: 'Zvornik Lake',
		lat: 44.3107,
		lon: 19.1394,
		sitelinks: 21,
		type: 'lake',
		access: [
			{ lat: 44.38, lon: 19.112, zone: 'BIH' },
			{ lat: 44.27, lon: 19.163, zone: 'SRB' },
		],
	},
	{
		qid: 1290986,
		ru: 'Монастырь Крушедол',
		local: 'Krušedol Monastery',
		lat: 45.1194,
		lon: 19.9453,
		sitelinks: 19,
		type: 'monastery',
		access: [{ lat: 45.118, lon: 19.944, zone: 'SRB' }],
	},
];

/**
 * The outlines of the large places of `PLACES` (data's `build-places`, GLOSSARY «Место точки старта»), rough ones
 * drawn by hand around Balaton and Deliblato Sands, which the Worker serves in the cells of `/data/place-outlines/`.
 * Deliblato's touches the cell of Belgrade (44_20), whose file holds it, though Belgrade is 33 km from its edge; the
 * cell of the Iron Gates (44_22) no outline touches, so it has no file.
 */
const PLACE_OUTLINES: readonly PlaceOutline[] = [
	{ qid: 6383, rings: [[46.7, 17.23, 46.8, 17.22, 46.92, 17.75, 47.05, 18.17, 46.98, 18.2, 46.88, 18.0, 46.72, 17.45]] },
	{ qid: 129979, rings: [[44.83, 20.88, 44.87, 21.25, 45.07, 21.33, 45.1, 21.05, 44.98, 20.86]] },
];

/** The cells of 1° × 1° an outline's bounds touch, as `placeOutlinesCell` names them. */
function cellsOf({ rings }: PlaceOutline): string[] {
	const lats = rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 0));
	const lons = rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 1));
	const cells: string[] = [];
	for (let lat = Math.floor(Math.min(...lats)); lat <= Math.max(...lats); lat += 1) {
		for (let lon = Math.floor(Math.min(...lons)); lon <= Math.max(...lons); lon += 1) {
			cells.push(placeOutlinesCell({ lat, lon }));
		}
	}
	return cells;
}

/**
 * The file of the cell at `path` (`/data/place-outlines/44_20.json`) of `outlines`, as the Worker serves it: the
 * outlines that touch the cell, or undefined for a cell none touches, which has no file.
 */
export function placeOutlinesFile(path: string, outlines: readonly PlaceOutline[] = PLACE_OUTLINES): PlaceOutlinesFile | undefined {
	const cell =
		path
			.split('/')
			.at(-1)
			?.replace(/\.json$/u, '') ?? '';
	const touching = outlines.filter((outline) => cellsOf(outline).includes(cell));
	return touching.length === 0 ? undefined : encodePlaceOutlines(touching);
}

/** Answers a cell's file of `outlines`, or 404 for a cell none touches. */
async function fulfilCell(route: Route, outlines: readonly PlaceOutline[]): Promise<void> {
	const file = placeOutlinesFile(new URL(route.request().url()).pathname, outlines);
	await (file === undefined
		? route.fulfill({ status: 404 })
		: route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(file) }));
}

/**
 * Places of the tests, as { lat, lon }: Belgrade, the origin of most; Budapest, the biggest city of `CITIES`, so the
 * first city card of a ring that holds it; and Niš.
 */
export const BELGRADE = { lat: 44.8176, lon: 20.4573 };
export const BUDAPEST = { lat: 47.498, lon: 19.04 };
export const NIS = { lat: 43.325, lon: 21.903 };

/**
 * Links to Belgrade's ring (`FROM_BELGRADE` of e2e/screen.ts): of 1–2 h, of 2–3 h, and for a citizen of Russia of
 * 2–3 h and of 7–8 h, the last hour before the days (`MAX_HOURS`).
 */
export const LINK_2_HOURS = `${FROM_BELGRADE}&h=2`;
export const LINK_3_HOURS = `${FROM_BELGRADE}&h=3`;
export const LINK_3_HOURS_RUS = `${FROM_BELGRADE}&h=3&cit=RUS`;
export const LINK_LAST_HOUR_RUS = `${FROM_BELGRADE}&h=8&cit=RUS`;

/**
 * The longest phrase and the shortest: Belgrade at 8 h and at 6–7 days, with four citizenships and four visas, or one
 * citizenship and no visas. In days the slider has its tab «часы ↓» or «← часы» (#83). The shortest is the link of 8 h
 * for a citizen of Russia, one link for the phrase's tests and the days'.
 */
export const LONGEST = `${FROM_BELGRADE}&h=8&cit=BIH,MNE,RUS,SRB&visas=CAN,GBR,SCHENGEN,USA`;
export const SHORTEST = LINK_LAST_HOUR_RUS;
export const LONGEST_IN_DAYS = `${FROM_BELGRADE}&d=7&cit=BIH,MNE,RUS,SRB&visas=CAN,GBR,SCHENGEN,USA`;
export const SHORTEST_IN_DAYS = `${FROM_BELGRADE}&d=7&cit=RUS`;

/** Visa rules three days older than the held clock (`holdTheClock` of e2e/screen.ts): «визовые правила от 6 ноября». */
export const OLD_RULES = '2026-11-06T12:00:00Z';

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
	await context.route('**/data/places.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(encodePlaces(PLACES)) }),
	);
	await context.route('**/data/place-outlines/*', (route) => fulfilCell(route, PLACE_OUTLINES));
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

/** Serves the page `places` as the places file instead of `PLACES`, or no places file at all for `undefined`. */
export async function servePlaces(page: Page, places: readonly Place[] | undefined): Promise<void> {
	await page.route('**/data/places.json', (route) =>
		places === undefined
			? route.fulfill({ status: 404 })
			: route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(encodePlaces(places)) }),
	);
}

/**
 * Serves the page the cells of `outlines` instead of `PLACE_OUTLINES`, or cells that never come for `undefined`: an
 * error of the server, not the 404 of a cell no outline touches.
 */
export async function servePlaceOutlines(page: Page, outlines: readonly PlaceOutline[] | undefined): Promise<void> {
	await page.route('**/data/place-outlines/*', (route) =>
		outlines === undefined ? route.fulfill({ status: 500 }) : fulfilCell(route, outlines),
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

/** A ring per N, whatever the origin: a band from N − 1 to N tenths of a degree around the origin the call asks for. */
export function ringOfHours(call: {
	readonly lat: string;
	readonly lon: string;
	readonly hours: number;
}): Extract<RingResponse, { outcome: 'ring' }> {
	return squareRing(Number(call.lat), Number(call.lon), [(call.hours - 1) / 10, call.hours / 10]);
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
 * with every country around open, which holds 12 cards of cities and places and «и ещё» (e2e/places.spec.ts), a row
 * that scrolls on every window.
 */
export const carouselRing = (): RingResponse => ({
	...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]),
	...visaRules(AROUND_SERBIA_WITH_SCHENGEN),
});

/**
 * Every country around Serbia, the start, open to a Russian: the band of 2–3 h around Belgrade (1° to 3°) holds 16
 * cities of `CITIES` and 8 places of `PLACES`, 12 cards and «и ещё 12».
 */
export const OPEN_AROUND_SERBIA: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'visa_free', citizenship: 'RUS' },
	ROU: { mode: 'visa_free', citizenship: 'RUS' },
	HRV: { mode: 'visa_free', citizenship: 'RUS' },
};
