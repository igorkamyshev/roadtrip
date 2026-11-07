// The external boundaries of the screen, doubled for its tests: `GET /api/ring` (a scripted double that records
// every request and answers or holds it), the basemap's tiles (`GET /tiles/{z}/{x}/{y}`, each one empty), and
// every other host, which is cut off in every test so that none reaches the network. The basemap's fonts and
// sprites are the client's own static assets. Geolocation and time come from Playwright itself (context
// permissions, `page.clock`).
import { test as base, expect, type BrowserContext, type Route } from '@playwright/test';
import type { RingResponse } from 'worker/api';

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

/** Lets the page read the position `at`, as a person who allowed geolocation. */
export async function allowGeolocation(context: BrowserContext, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await context.setGeolocation({ latitude: at.lat, longitude: at.lon });
	await context.grantPermissions(['geolocation']);
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
	return { outcome: 'ring', ring: { type: 'MultiPolygon', coordinates: [polygon] }, startCountry: 'SRB', source: 'calculation' };
}
