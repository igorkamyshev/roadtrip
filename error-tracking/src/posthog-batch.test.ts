import { describe, expect, test, vi } from 'vitest';

import type { Logger } from './logger';
import { sendToPostHog } from './posthog-batch';
import type { ExceptionEvent } from './trace-to-exceptions';

const EVENT: ExceptionEvent = {
	event: '$exception',
	uuid: '0b6f6a9e-1b4c-5d6e-8f90-123456789abc',
	distinct_id: '019a5d2c-7f3e-7b1a-9c4d-2e6f8a0b1c3d',
	properties: {
		$lib: 'roadtrip-error-tracking',
		environment: 'production',
		worker: 'roadtrip',
		execution_model: 'stateless',
		outcome: 'exception',
		$exception_list: [{ type: 'Error', value: 'boom' }],
		$process_person_profile: false,
		$session_id: '019a5d2c-8a41-7e02-b5c6-d7e8f9a0b1c2',
	},
};

// A network double: answers from a script and records the requests
function scriptedFetch(responses: (number | 'network-error')[]) {
	const requests: { url: string; body: unknown }[] = [];
	const fetch = (url: string, init: RequestInit): Promise<Response> => {
		requests.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body });
		const next = responses.shift() ?? 200;
		if (next === 'network-error') {
			return Promise.reject(new TypeError('fetch failed'));
		}
		return Promise.resolve(new Response(null, { status: next }));
	};
	return { fetch, requests };
}

function deps(responses: (number | 'network-error')[]) {
	const network = scriptedFetch(responses);
	const pauses: number[] = [];
	const logger = { error: vi.fn<Logger['error']>() };
	return {
		network,
		pauses,
		logger,
		deps: {
			token: 'phc_test',
			fetch: network.fetch,
			sleep: (ms: number) => {
				pauses.push(ms);
				return Promise.resolve();
			},
			logger,
		},
	};
}

describe('sendToPostHog', () => {
	test('a successful send is one /batch/ request with the project key and the events', async () => {
		const { network, logger, deps: d } = deps([200]);

		await sendToPostHog([EVENT], d);

		expect(network.requests).toEqual([{ url: 'https://us.i.posthog.com/batch/', body: { api_key: 'phc_test', batch: [EVENT] } }]);
		expect(logger.error).not.toHaveBeenCalled();
	});

	test('network errors, 5xx and 429 are retried with pauses until success', async () => {
		const { network, pauses, deps: d } = deps(['network-error', 503, 200]);

		await sendToPostHog([EVENT], d);

		expect(network.requests).toHaveLength(3);
		expect(pauses).toEqual([500, 2_000]);
		// A retry sends the same batch with the same uuids, so PostHog does not double the events
		expect(new Set(network.requests.map((r) => JSON.stringify(r.body))).size).toBe(1);

		const rateLimited = deps([429, 200]);
		await sendToPostHog([EVENT], rateLimited.deps);
		expect(rateLimited.network.requests).toHaveLength(2);
	});

	test('after two retries the batch is dropped into the log, without throwing', async () => {
		const { network, logger, deps: d } = deps([503, 503, 503, 200]);

		await expect(sendToPostHog([EVENT], d)).resolves.toBeUndefined();

		expect(network.requests).toHaveLength(3);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('HTTP 503'));
	});

	test('4xx is not retried: such a request will not pass the second time', async () => {
		const { network, logger, deps: d } = deps([400]);

		await sendToPostHog([EVENT], d);

		expect(network.requests).toHaveLength(1);
		expect(logger.error).toHaveBeenCalledTimes(1);
	});

	test('an empty batch sends nothing', async () => {
		const { network, deps: d } = deps([]);

		await sendToPostHog([], d);

		expect(network.requests).toEqual([]);
	});
});
