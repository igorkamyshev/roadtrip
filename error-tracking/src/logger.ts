// The one way roadtrip workers log errors (no console.error elsewhere in a worker). The
// roadtrip-error-tracking Tail Worker turns each console.error into a PostHog
// $exception: the Error argument gives the type, message and stack, and the
// context object ties it to the browser's session. `info` lines stay in the Workers logs.

export type LogContext = Readonly<
	{
		/** The browser's PostHog distinct_id (`X-POSTHOG-DISTINCT-ID`); becomes the event's distinct_id. */
		distinct_id?: string;
		/** The browser's PostHog session (`X-POSTHOG-SESSION-ID`); becomes the event's $session_id. */
		session_id?: string;
	} & Record<string, unknown>
>;

export const logger = {
	/**
	 * `context` fields other than `distinct_id` and `session_id` (strings, numbers,
	 * booleans) become event properties, for example
	 * `{ distinct_id, session_id, reason: 'timeout', citizenship: 'RUS', served: 'stale' }`.
	 */
	error(message: string, error?: unknown, context?: LogContext): void {
		const args: unknown[] = [message];
		if (error !== undefined) {
			args.push(error);
		}
		if (context !== undefined) {
			args.push(context);
		}
		console.error(...args);
	},

	/** A line worth keeping in the Workers logs that the Owner need not look at. */
	info(message: string, details?: unknown): void {
		if (details === undefined) {
			console.log(message);
		} else {
			console.log(message, details);
		}
	},
};

export type Logger = typeof logger;

/** The message of whatever was thrown, for a log line or an answer. */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
