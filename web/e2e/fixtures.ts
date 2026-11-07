// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (a scripted double that records
// every request and answers or holds it), the basemap's tiles, the zone outlines of the dataset, and every other
// host, which is cut off so that a test never reaches the network. Geolocation and time come from Playwright itself (context permissions,
// `page.clock`).
import { test as base, expect, type BrowserContext, type Route } from '@playwright/test';
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

/** A transparent 1×1 PNG: every raster tile of the temporary basemap. */
const EMPTY_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');

async function cutOffTheNetwork(context: BrowserContext, ringApi: RingApi): Promise<void> {
	// Routes run newest first: the catch-all goes first, so the tiles and the API take precedence over it.
	await context.route('**/*', async (route) => {
		const { hostname } = new URL(route.request().url());
		await (hostname === 'localhost' ? route.fallback() : route.abort('blockedbyclient'));
	});
	await context.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: EMPTY_TILE }));
	await context.route('**/data/zones.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ZONE_OUTLINES) }));
	await context.route('**/api/ring?*', (route) => ringApi.handle(route));
}

export const test = base.extend<{ ringApi: RingApi }>({
	ringApi: async ({ context }, use) => {
		const ringApi = new RingApi();
		await cutOffTheNetwork(context, ringApi);
		await use(ringApi);
	},
});

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
