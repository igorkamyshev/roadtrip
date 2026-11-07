// The one way roadtrip workers log errors (no console.error elsewhere in a worker). The
// roadtrip-error-tracking Tail Worker turns each console.error into a PostHog
// $exception: the Error argument gives the type, message and stack, and the
// context object gives the User. `info` lines stay in the Workers logs.

export type LogContext = Readonly<
	{
		/** Telegram `from.id` of the User the error happened for; becomes the PostHog distinct_id. */
		userId?: number | string;
	} & Record<string, unknown>
>;

export const logger = {
	/**
	 * `context` fields other than `userId` (strings, numbers, booleans) become
	 * event properties, for example `{ userId, reason: 'bot_check', episodeId }`.
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
