// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (a scripted double that records
// every request and answers or holds it), the basemap's tiles (`GET /tiles/{z}/{x}/{y}`, each one empty), the
// dataset's zone outlines (`/data/zones.json`, `ZONE_OUTLINES`) and cities (`/data/cities.json`, `CITIES`, or a
// test's own through `serveCities`), and every other host, which is cut off in every test so that none reaches the
// network. The basemap's fonts and sprites are the client's own static assets. Geolocation
// and time come from Playwright itself (context permissions, `page.clock`).
import { test as base, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import type { CitiesFile } from 'data/cities-file';
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
 * The cities file the Worker serves at `/data/cities.json` (data's `build-cities`): real cities of GeoNames around
 * Belgrade, biggest first, as [id, ru, local, lat, lon, population, zone]. Ilidža has no Russian name here.
 */
export const CITIES: CitiesFile = {
	format: 1,
	cities: [
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
	],
};

/** What the page asked of the network: the basemap's tiles it got, and the requests to other hosts, cut off. */
export class Network {
	readonly tiles: URL[] = [];
	readonly blocked: string[] = [];
}

async function cutOffTheNetwork(context: BrowserContext, network: Network): Promise<void> {
	// Routes run newest first; the catch-all lets the page's own host through to the routes before it.
	await context.route('**/tiles/**', async (route) => {
		network.tiles.push(new URL(route.request().url()));
		// An empty vector tile: a basemap with nothing on it.
		await route.fulfill({ status: 200, contentType: 'application/x-protobuf', body: Buffer.alloc(0) });
	});
	await context.route('**/data/zones.json', (route) =>
		route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONE_OUTLINES) }),
	);
	await context.route('**/data/cities.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CITIES) }));
	await context.route('**/*', async (route) => {
		const { hostname } = new URL(route.request().url());
		if (hostname === 'localhost') {
			await route.fallback();
			return;
		}
		network.blocked.push(route.request().url());
		await route.abort('blockedbyclient');
	});
}

export const test = base.extend<{ network: Network; ringApi: RingApi }>({
	network: [
		async ({ context }, use) => {
			const network = new Network();
			await cutOffTheNetwork(context, network);
			await use(network);
		},
		{ auto: true },
	],
	ringApi: async ({ context }, use) => {
		const ringApi = new RingApi();
		await context.route('**/api/ring?*', (route) => ringApi.handle(route));
		await use(ringApi);
	},
});

/** Serves the page `cities` as the cities file instead of `CITIES`. */
export async function serveCities(page: Page, cities: CitiesFile['cities']): Promise<void> {
	const file: CitiesFile = { format: 1, cities };
	await page.route('**/data/cities.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(file) }));
}

/** Lets the page read the position `at`, as a person who allowed geolocation. */
export async function allowGeolocation(context: BrowserContext, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await context.setGeolocation({ latitude: at.lat, longitude: at.lon });
	await context.grantPermissions(['geolocation']);
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
