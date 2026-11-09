// The double of `GET /api/ring`, the `ringApi` fixture (e2e/fixtures.ts): it records every request the screen sends
// and answers it as the test scripts, or holds it until the test answers.
import { expect, type Route } from '@playwright/test';
import type { RingResponse } from 'worker/api';

/** A request to `GET /api/ring`, as the screen sent it. */
interface RingCall {
	readonly lat: string;
	readonly lon: string;
	/** The ring's bounds, `from` and `to`: `hours` is the upper one, which names the slider's cell. */
	readonly from: number;
	readonly hours: number;
	readonly cit: string | null;
	readonly visas: string | null;
	readonly query: string;
	/** Its headers, lowercase: PostHog's `x-posthog-*` among them on the production host. */
	readonly headers: Readonly<Record<string, string>>;
}

/** How the double answers: 200 with a body, another status, or a dropped connection. */
export type RingReply = RingResponse | { readonly status: number } | 'network error';

/** Answers to a call, or undefined to hold it until the test calls `answer`. */
type RingResponder = (call: RingCall) => RingReply | undefined;

export class RingApi {
	readonly calls: RingCall[] = [];
	#held: { call: RingCall; route: Route }[] = [];
	/** None holds every call. */
	#responder: RingResponder | undefined;
	/** Where the calls of the page's current load start in `calls`. */
	#loadStart = 0;

	/** How every next call is answered; by default each one is held. */
	respond(responder: RingResponder): void {
		this.#responder = responder;
	}

	/** Holds every next call, as by default. */
	hold(): void {
		this.#responder = undefined;
	}

	/** Answers the oldest held call (or the held call for `hours`). */
	async answer(reply: RingReply, hours?: number): Promise<RingCall> {
		const isAsked = (held: { call: RingCall }): boolean => hours === undefined || held.call.hours === hours;
		await expect.poll(() => this.#held.some(isAsked)).toBe(true);
		const [{ call, route }] = this.#held.splice(this.#held.findIndex(isAsked), 1);
		await fulfil(route, reply);
		return call;
	}

	/** Resolves once the screen has sent `count` calls in all. */
	async waitForCalls(count: number): Promise<RingCall[]> {
		await expect.poll(() => this.calls.length, { message: `${count} calls to /api/ring` }).toBeGreaterThanOrEqual(count);
		return this.calls;
	}

	/** A new load of the page starts (`reopen`): the page forgets its rings, so only the calls from here count. */
	newLoad(): void {
		this.#loadStart = this.calls.length;
	}

	/** Whether the page, since it was loaded, has asked for the ring its link names: `…#/?p=lat,lon&h=…&cit=…&visas=…`. */
	askedFor(link: string): boolean {
		const state = new URLSearchParams(new URL(link).hash.replace(/^#\/\?/u, ''));
		const [lat, lon] = (state.get('p') ?? '').split(',');
		return this.calls
			.slice(this.#loadStart)
			.some(
				(call) =>
					call.lat === lat &&
					call.lon === lon &&
					call.hours === Number(state.get('h')) &&
					call.cit === state.get('cit') &&
					call.visas === state.get('visas'),
			);
	}

	async handle(route: Route): Promise<void> {
		const url = new URL(route.request().url());
		const call: RingCall = {
			lat: url.searchParams.get('lat') ?? '',
			lon: url.searchParams.get('lon') ?? '',
			from: Number(url.searchParams.get('from')),
			hours: Number(url.searchParams.get('to')),
			cit: url.searchParams.get('cit'),
			visas: url.searchParams.get('visas'),
			query: url.search,
			headers: route.request().headers(),
		};
		this.calls.push(call);
		const reply = this.#responder?.(call);
		if (reply === undefined) {
			this.#held.push({ call, route });
			return;
		}
		await fulfil(route, reply);
	}
}

async function fulfil(route: Route, reply: RingReply): Promise<void> {
	if (reply === 'network error') {
		await route.abort('connectionreset');
	} else if ('outcome' in reply) {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) });
	} else {
		await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify({ error: 'double' }) });
	}
}
