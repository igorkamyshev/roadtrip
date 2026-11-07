import { logger } from './logger';
import { sendToPostHog } from './posthog-batch';
import { traceToExceptions } from './trace-to-exceptions';

// Tail Worker: the runtime hands it the TraceItem of every run of the roadtrip
// workers that list roadtrip-error-tracking in tail_consumers. Errors go to PostHog
// Error Tracking. Never add this worker to its own tail_consumers: its error
// logs would loop.
export default {
	tail(events, env, ctx) {
		const exceptions = events.flatMap((item) => {
			try {
				return traceToExceptions(item);
			} catch (e) {
				// One bad run must not cost the rest of the batch
				logger.error(`[error-tracking] cannot convert trace of ${item.scriptName}`, e);
				return [];
			}
		});

		if (exceptions.length === 0) {
			return;
		}

		// Typed as the key in wrangler.jsonc, but .dev.vars may empty it for wrangler dev (README).
		const token: string = env.POSTHOG_API_KEY;
		if (token === '') {
			logger.info('[error-tracking] POSTHOG_API_KEY is not set, not sending', JSON.stringify(exceptions));
			return;
		}

		ctx.waitUntil(
			sendToPostHog(exceptions, {
				token,
				// A wrapper, not fetch itself: workerd rejects calling it as a method of deps with "Illegal invocation"
				fetch: (url, init) => fetch(url, init),
				sleep: (ms) =>
					new Promise((resolve) => {
						setTimeout(resolve, ms);
					}),
				logger,
			}),
		);
	},
} satisfies ExportedHandler<Env>;
