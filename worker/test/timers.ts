// The tests' clock, which the handler reads through `deps.now`, and its timers on that clock (`deps.sleep`).

export interface Clock {
	now: number;
}

/** The handler's timers on a clock the test moves. */
export interface Timers {
	/** `deps.sleep`: ends once the test has moved the clock past it with `advance`, never on its own, as `setTimeout` would. */
	readonly sleep: (ms: number) => Promise<void>;
	/** Lets the handler run up to its next wait, moves the clock by `ms`, ends the sleeps due by then, and lets it run on. */
	readonly advance: (ms: number) => Promise<void>;
}

/** Timers on `clock`. */
export function timersOn(clock: Clock): Timers {
	const sleeping: { readonly until: number; readonly wake: () => void }[] = [];
	return {
		sleep: (ms) =>
			new Promise((wake) => {
				sleeping.push({ until: clock.now + ms, wake });
			}),
		advance: async (ms) => {
			await settled();
			clock.now += ms;
			for (const sleeper of sleeping.filter(({ until }) => until <= clock.now)) {
				sleeping.splice(sleeping.indexOf(sleeper), 1);
				sleeper.wake();
			}
			await settled();
		},
	};
}

/** Once the promises that can go on have gone on: a few turns of Node's event loop. */
async function settled(): Promise<void> {
	for (let turn = 0; turn < 10; turn++) {
		await new Promise((resolve) => {
			setImmediate(resolve);
		});
	}
}
