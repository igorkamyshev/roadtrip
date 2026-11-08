import { afterEach, describe, expect, test, vi } from 'vitest';

import worker from './index';

// A run of the roadtrip Worker that logged one error
const FAILED_RUN: TraceItem = {
	event: null,
	eventTimestamp: Date.parse('2026-11-04T10:00:00.000Z'),
	logs: [{ timestamp: Date.parse('2026-11-04T10:00:00.001Z'), level: 'error', message: ['[ring] the engine failed'] }],
	exceptions: [],
	diagnosticsChannelEvents: [],
	scriptName: 'roadtrip',
	entrypoint: 'default',
	outcome: 'ok',
	executionModel: 'stateless',
	truncated: false,
	cpuTime: 5,
	wallTime: 50,
};

// The handler only hands its sends to waitUntil, which the double records
function executionContext() {
	const background: Promise<unknown>[] = [];
	const ctx = {
		waitUntil: (promise: Promise<unknown>) => {
			background.push(promise);
		},
	} as unknown as ExecutionContext;
	return { ctx, background };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('the tail handler', () => {
	test('with an empty POSTHOG_API_KEY (.dev.vars, or before the Owner sets it) prints the events instead of sending them', () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		vi.stubGlobal('fetch', fetch);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { ctx, background } = executionContext();

		worker.tail([FAILED_RUN], { POSTHOG_API_KEY: '' }, ctx);

		expect(fetch).not.toHaveBeenCalled();
		expect(background).toEqual([]);
		expect(log).toHaveBeenCalledWith('[error-tracking] POSTHOG_API_KEY is not set, not sending', expect.stringContaining('"$exception"'));
		expect(log).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('[ring] the engine failed'));
	});

	test('with a key sends the events to PostHog in the background', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', fetch);
		const { ctx, background } = executionContext();

		worker.tail([FAILED_RUN], { POSTHOG_API_KEY: 'phc_test' }, ctx);
		await Promise.all(background);

		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0] ?? [];
		expect(url).toBe('https://us.i.posthog.com/batch/');
		expect(JSON.parse(String(init?.body))).toMatchObject({
			api_key: 'phc_test',
			batch: [{ event: '$exception', properties: { worker: 'roadtrip', $exception_list: [{ value: '[ring] the engine failed' }] } }],
		});
	});

	test('a run without errors neither sends nor prints anything', () => {
		const fetch = vi.fn<typeof globalThis.fetch>();
		vi.stubGlobal('fetch', fetch);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		const { ctx, background } = executionContext();

		worker.tail([{ ...FAILED_RUN, logs: [] }], { POSTHOG_API_KEY: '' }, ctx);

		expect(fetch).not.toHaveBeenCalled();
		expect(background).toEqual([]);
		expect(log).not.toHaveBeenCalled();
	});
});
