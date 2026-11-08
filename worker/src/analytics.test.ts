// The Worker's PostHog client (spec «Аналитика и ошибки», «Worker»): posthog-node with the network under it doubled,
// so a test sees the very batch PostHog would get. Which events and properties the routes send is in the routes' own
// tests, against a recording double (test/api.ts).
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type PostHogFetch, requestAnalytics } from './analytics.ts';

const TOKEN = 'phc_test';
const BROWSER = '019a5f2c-0d4e-7c3b-9f1a-2b3c4d5e6f70';
const SESSION = '019a5f2c-1a2b-7c3d-8e4f-5a6b7c8d9e0f';
const served = { source: 'cache', outcome: 'ring', hours: 3, duration_ms: 41 } as const;

/** PostHog's capture API: keeps each request and the events of its batch. */
function postHogDouble() {
	const requests: { url: string; apiKey: string; batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] }[] = [];
	const fetch: PostHogFetch = async (url, options) => {
		const body = options.body instanceof Blob ? new Uint8Array(await options.body.arrayBuffer()) : options.body;
		const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : (body ?? new Uint8Array());
		const text = new TextDecoder().decode(options.headers['Content-Encoding'] === 'gzip' ? gunzipSync(bytes) : bytes);
		const { api_key: apiKey, batch } = JSON.parse(text) as { api_key: string; batch: (typeof requests)[number]['batch'] };
		requests.push({ url, apiKey, batch });
		return { status: 200, text: async () => '{"status":"Ok"}', json: async () => ({ status: 'Ok' }) };
	};
	return { fetch, requests };
}

/** The analytics of a GET of `url` with `headers`, the sends it handed to waitUntil, and PostHog's double. */
function analyticsOf(url: string, headers: Record<string, string> = {}) {
	const posthog = postHogDouble();
	const background: Promise<unknown>[] = [];
	const analytics = requestAnalytics(new Request(url, { headers }), {
		token: TOKEN,
		waitUntil: (promise) => {
			background.push(promise);
		},
		fetch: posthog.fetch,
	});
	const settle = () => Promise.all(background);
	return { analytics, background, settle, requests: posthog.requests };
}

describe("the Worker's analytics", () => {
	it("send each event at once to PostHog's US cloud with the project token, in the request's waitUntil", async () => {
		const { analytics, background, settle, requests } = analyticsOf('https://roadtrip.kamyshev.me/api/ring?lat=1&lon=2&hours=3&cit=RUS', {
			'X-POSTHOG-DISTINCT-ID': BROWSER,
			'X-POSTHOG-SESSION-ID': SESSION,
		});

		analytics.capture('ring served', served);
		analytics.shutdown();
		expect(background).toHaveLength(2);
		await settle();

		expect(requests).toEqual([{ url: 'https://us.i.posthog.com/batch/', apiKey: TOKEN, batch: [expect.objectContaining({ event: 'ring served' })] }]);
	});

	it("tie each event to the browser's distinct_id and session, and create no person", async () => {
		const { analytics, settle, requests } = analyticsOf('https://roadtrip.kamyshev.me/api/ring?lat=1&lon=2&hours=3&cit=RUS', {
			'X-POSTHOG-DISTINCT-ID': BROWSER,
			'X-POSTHOG-SESSION-ID': SESSION,
		});

		analytics.capture('ring served', served);
		analytics.capture('sherpa fetched', { citizenship: 'RUS', result: 'ok', status: 201, duration_ms: 480, mode: 'blocking' });
		await settle();

		// Each event is a request of its own; they may come in either order.
		const events = requests.flatMap((request) => request.batch).toSorted((one, two) => one.event.localeCompare(two.event));
		expect(events.map(({ event, distinct_id, properties }) => ({ event, distinct_id, properties }))).toEqual([
			{
				event: 'ring served',
				distinct_id: BROWSER,
				properties: expect.objectContaining({ ...served, $session_id: SESSION, $process_person_profile: false }),
			},
			{
				event: 'sherpa fetched',
				distinct_id: BROWSER,
				properties: expect.objectContaining({ citizenship: 'RUS', result: 'ok', $session_id: SESSION, $process_person_profile: false }),
			},
		]);
		// Not even the request's URL, which holds the origin.
		expect(JSON.stringify(events)).not.toContain('lat=');
	});

	it('without the browser’s ids, send as the one distinct_id `server`, with no session', async () => {
		const { analytics, settle, requests } = analyticsOf('https://roadtrip.kamyshev.me/api/ring?lat=1&lon=2&hours=3&cit=RUS');

		analytics.capture('ring served', served);
		await settle();

		const [event] = requests[0].batch;
		expect(event).toMatchObject({ distinct_id: 'server', properties: { $process_person_profile: false } });
		expect(event.properties).not.toHaveProperty('$session_id');
	});

	it('cut an id the browser sent to 1000 characters', async () => {
		const { analytics, settle, requests } = analyticsOf('https://roadtrip.kamyshev.me/api/ring', {
			'X-POSTHOG-DISTINCT-ID': 'd'.repeat(1500),
			'X-POSTHOG-SESSION-ID': 's'.repeat(1500),
		});

		analytics.capture('ring served', served);
		await settle();

		const [event] = requests[0].batch;
		expect(event.distinct_id).toBe('d'.repeat(1000));
		expect(event.properties.$session_id).toBe('s'.repeat(1000));
	});

	it.each([
		['wrangler dev', 'http://localhost:8787/api/ring'],
		['workers.dev', 'https://roadtrip.kamyshev.workers.dev/api/ring'],
		['a subdomain', 'https://www.roadtrip.kamyshev.me/api/ring'],
	])('send nothing off the production host: %s', async (_, url) => {
		const { analytics, settle, requests } = analyticsOf(url, { 'X-POSTHOG-DISTINCT-ID': BROWSER });

		analytics.capture('ring served', served);
		analytics.shutdown();
		await settle();

		expect(requests).toEqual([]);
	});
});
