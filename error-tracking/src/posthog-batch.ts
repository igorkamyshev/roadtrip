import type { Logger } from './logger';
import type { ExceptionEvent } from './trace-to-exceptions';

const BATCH_URL = 'https://us.i.posthog.com/batch/';

// Three tries of up to 5 s plus pauses fit well within the 30 s waitUntil
// budget. No queue on purpose: if PostHog is down longer, this run's events are lost
const RETRY_DELAYS_MS = [500, 2_000];
const REQUEST_TIMEOUT_MS = 5_000;

export type SendDeps = Readonly<{
	token: string;
	fetch: (url: string, init: RequestInit) => Promise<Response>;
	sleep: (ms: number) => Promise<void>;
	logger: Pick<Logger, 'error'>;
}>;

type Attempt = Readonly<{ ok: true }> | Readonly<{ ok: false; retryable: boolean; reason: string }>;

/**
 * Sends the events to PostHog in one /batch/. Retries only what can pass the
 * second time: network, timeout, 5xx and 429. Never throws: when the tries run
 * out, it writes to this worker's own log.
 */
export async function sendToPostHog(events: readonly ExceptionEvent[], deps: SendDeps): Promise<void> {
	if (events.length === 0) {
		return;
	}

	const body = JSON.stringify({ api_key: deps.token, batch: events });

	for (let attempt = 0; ; attempt++) {
		const result = await post(body, deps);
		if (result.ok) {
			return;
		}
		const delay = RETRY_DELAYS_MS.at(attempt);
		if (!result.retryable || delay === undefined) {
			deps.logger.error(
				`[error-tracking] PostHog batch dropped after ${attempt + 1} attempt(s): ${result.reason}, events=${events.length}`,
			);
			return;
		}
		await deps.sleep(delay);
	}
}

async function post(body: string, deps: SendDeps): Promise<Attempt> {
	let response: Response;
	try {
		response = await deps.fetch(BATCH_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		});
	} catch (e) {
		return { ok: false, retryable: true, reason: String(e) };
	}
	// The body is not needed, but unread it holds the connection until the retry
	await response.body?.cancel().catch(() => {});
	if (response.ok) {
		return { ok: true };
	}
	return { ok: false, retryable: response.status >= 500 || response.status === 429, reason: `HTTP ${response.status}` };
}
