// The page's clock for what the screen shows by the time (the age of the visa rules, today's rows of the visas'
// table): to the minute, read from outside React like any changing source, so that a render stays pure and the
// screen follows the time once a minute.
import { useSyncExternalStore } from 'react';

const MINUTE_MS = 60_000;

function subscribe(onChange: () => void): () => void {
	const timer = setInterval(onChange, MINUTE_MS);
	return () => {
		clearInterval(timer);
	};
}

/** The time to the minute: the same value for every read within a minute, as a store's snapshot must be. */
function minute(): number {
	return Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS;
}

/** Now, in milliseconds since the epoch, to the minute. */
export function useMinute(): number {
	return useSyncExternalStore(subscribe, minute);
}
