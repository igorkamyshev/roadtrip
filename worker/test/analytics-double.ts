// PostHog's double for the handlers (src/analytics.ts, `Analytics`): it records the events instead of sending them.
import type { Analytics, WorkerEvent, WorkerEvents } from '../src/analytics.ts';

/** PostHog's double: the Worker's events of every request, in the order they were captured. */
export interface AnalyticsDouble extends Analytics {
	readonly events: readonly { readonly event: WorkerEvent; readonly properties: object }[];
	/** The properties of each `event` captured, in order. */
	readonly named: <Event extends WorkerEvent>(event: Event) => WorkerEvents[Event][];
}

export function analyticsDouble(): AnalyticsDouble {
	const events: { readonly event: WorkerEvent; readonly properties: object }[] = [];
	const byEvent: { readonly [Event in WorkerEvent]: WorkerEvents[Event][] } = { 'ring served': [], 'sherpa fetched': [] };
	return {
		events,
		capture: <Event extends WorkerEvent>(event: Event, properties: WorkerEvents[Event]) => {
			events.push({ event, properties });
			byEvent[event].push(properties);
		},
		named: <Event extends WorkerEvent>(event: Event) => {
			const captured: WorkerEvents[Event][] = byEvent[event];
			return [...captured];
		},
	};
}
