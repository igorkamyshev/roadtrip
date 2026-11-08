// PostHog in the browser (spec «Аналитика и ошибки», «Решения по тестам», seam 3): the screen opened on the
// production host, where PostHog runs, with PostHog's proxy doubled (`PostHogDouble`): the page views, the screen's
// own events and their properties. Never the origin.
import type { Page } from '@playwright/test';
import type { RingResponse, RingSource } from 'worker/api';
import type { RingResultOutcome } from '../src/analytics/events.ts';
import {
	allowGeolocation,
	expect,
	failGeolocation,
	openInProduction,
	POSTHOG_PROXY,
	PRODUCTION,
	type RingReply,
	squareRing,
	test,
	visaRules,
} from './fixtures.ts';
import { dottedHours, dragSlider, expectRingCard, firstCard, leave, mapAtRest, phrase, slider } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=3&cit=RUS';

/** Where the page's clock starts in the tests that hold it, in ms since the epoch. */
const START = Date.UTC(2026, 10, 7, 10);
/**
 * Stops the page's clock before the page loads, so that the screen's ask is at a known time: a minute after `START`,
 * which a busy machine cannot have passed between the two calls. `page.clock.resume()` lets posthog-js send.
 */
async function holdTheClock(page: Page): Promise<void> {
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 60_000);
}

/** While the clock stands still, lets the page run what is due now (its zero timeouts) until `done` holds. */
async function runNowUntil(page: Page, done: () => Promise<boolean> | boolean): Promise<void> {
	await expect
		.poll(async () => {
			await page.clock.runFor(0);
			return done();
		})
		.toBe(true);
}

/** posthog-js sends its queue every few seconds. */
const SENT = { timeout: 15_000 };

test('one page view a load, and no URL PostHog gets has the link’s #…, however the state changes', async ({ page, ringApi, posthog }) => {
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

	await openInProduction(page, LINK);
	await expectRingCard(page, '2–3 ч');
	await dragSlider(page, 5);
	await expectRingCard(page, '4–5 ч');
	await expect.poll(() => posthog.named('ring result'), SENT).toHaveLength(2);

	expect(posthog.named('$pageview')).toEqual([expect.objectContaining({ $current_url: `${PRODUCTION}/` })]);
	const sent = JSON.stringify(posthog.events);
	expect(sent).not.toContain('#/');
	expect(sent).not.toContain('44.8');
	expect(sent).not.toContain('20.4');
});

test("every ring request carries the browser's PostHog ids, the first one of the load too", async ({ page, ringApi, posthog }) => {
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

	await openInProduction(page, LINK);
	await expectRingCard(page, '2–3 ч');
	await dragSlider(page, 5);
	await expect.poll(() => posthog.named('ring result'), SENT).toHaveLength(2);

	const [result] = posthog.events.filter((sent) => sent.event === 'ring result');
	expect(ringApi.calls.map(({ headers }) => [headers['x-posthog-distinct-id'], headers['x-posthog-session-id']])).toEqual([
		[result.properties.distinct_id, result.properties.$session_id],
		[result.properties.distinct_id, result.properties.$session_id],
	]);
	expect(result.properties.distinct_id).toEqual(expect.any(String));
	expect(result.properties.$session_id).toEqual(expect.any(String));
});

test('an error the screen did not catch goes to PostHog', async ({ page, ringApi, posthog }) => {
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));
	await openInProduction(page, LINK);
	await expectRingCard(page, '2–3 ч');

	await page.evaluate(() => {
		setTimeout(() => {
			throw new TypeError('the screen broke');
		});
	});

	await expect.poll(() => posthog.named('$exception'), SENT).toEqual([
		expect.objectContaining({ $exception_list: [expect.objectContaining({ type: 'TypeError', value: 'the screen broke' })] }),
	]);
});

test('posthog-js comes after the screen, and still gets the errors thrown before it came, and the ring waits for its ids', async ({
	page,
	context,
	ringApi,
	posthog,
}) => {
	// The chunk of posthog-js held until the screen is up and has thrown.
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await context.route(/\/assets\/posthog-client-[\w-]+\.js$/u, async (route) => {
		await held;
		await route.fallback();
	});
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

	await openInProduction(page, LINK);
	await expect(phrase(page)).toContainText('2–3 часа в пути.');
	await page.evaluate(() => {
		setTimeout(() => {
			throw new RangeError('broke before PostHog');
		});
	});
	await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
	expect(ringApi.calls).toEqual([]);
	release();

	await expectRingCard(page, '2–3 ч');
	expect(ringApi.calls[0].headers['x-posthog-distinct-id']).toEqual(expect.any(String));
	await expect.poll(() => posthog.named('$exception'), SENT).toEqual([
		expect.objectContaining({ $exception_list: [expect.objectContaining({ type: 'RangeError', value: 'broke before PostHog' })] }),
	]);
});

test('off the production host PostHog is not started: nothing goes to it', async ({ page, context, ringApi, posthog }) => {
	const toPostHog: string[] = [];
	context.on('request', (request) => {
		if (request.url().startsWith(POSTHOG_PROXY)) {
			toPostHog.push(request.url());
		}
	});
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

	await page.goto(LINK);
	await expectRingCard(page, '2–3 ч');
	await dragSlider(page, 5);
	await expectRingCard(page, '4–5 ч');
	await leave(page);

	// A started PostHog asks for its remote config at once.
	expect(toPostHog).toEqual([]);
	expect(posthog.events).toEqual([]);
	// Nor do the ring requests carry its ids.
	expect(ringApi.calls).toHaveLength(2);
});

test('no request of a test reaches PostHog: one no route answers, a beacon of a page going away included, is cut off', async ({
	page,
	context,
}) => {
	// As after a test, when the routes are gone and the page's beacons still leave.
	await context.unrouteAll({ behavior: 'ignoreErrors' });
	const failed: string[] = [];
	const finished: string[] = [];
	page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText}`));
	page.on('requestfinished', (request) => finished.push(request.url()));
	// PostHog's proxy on our domain, and PostHog's own host.
	const hosts = [POSTHOG_PROXY, 'https://us.i.posthog.com'];
	await page.goto('about:blank');

	await page.evaluate((urls) => {
		for (const url of urls) {
			navigator.sendBeacon(`${url}/e/`, '{}');
		}
		void fetch(`${urls[0]}/flags/`, { mode: 'no-cors' }).catch(() => undefined);
	}, hosts);

	await expect.poll(() => failed.toSorted()).toEqual(
		[`${hosts[0]}/e/`, `${hosts[0]}/flags/`, `${hosts[1]}/e/`].map((url) => `${url} net::ERR_PROXY_CONNECTION_FAILED`),
	);
	expect(finished).toEqual([]);
});

test.describe('start set', () => {
	test('on load from a link nothing was saved for: by link, with the nearest city and its country; and link opened', async ({ page, ringApi, posthog }) => {
		ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

		await openInProduction(page, LINK);

		// In whichever order posthog-js sends them.
		await expect.poll(() => posthog.ours.toSorted(), SENT).toEqual(['link opened', 'ring result', 'start set']);
		expect(posthog.named('start set')).toEqual([
			expect.objectContaining({ method: 'link', start_country: 'SRB', start_city: 'Белград', start_city_id: 792680 }),
		]);
		expect(posthog.named('link opened')).toEqual([expect.not.objectContaining({ method: expect.anything() })]);
	});

	test('on load from the saved state: by saved, and no link opened; a link opened over a saved state: by link', async ({ page, ringApi, posthog }) => {
		ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));
		await openInProduction(page, LINK);
		await expect.poll(() => posthog.named('start set'), SENT).toHaveLength(1);

		await page.goto('about:blank');
		await openInProduction(page, '/');
		await expect.poll(() => posthog.named('start set'), SENT).toHaveLength(2);
		await page.goto('about:blank');
		await openInProduction(page, '/#/?p=43.32470,21.90330&h=2&cit=RUS');
		await expect.poll(() => posthog.named('start set'), SENT).toHaveLength(3);

		expect(posthog.named('start set')).toEqual([
			expect.objectContaining({ method: 'link', start_city: 'Белград' }),
			expect.objectContaining({ method: 'saved', start_country: 'SRB', start_city: 'Белград', start_city_id: 792680 }),
			expect.objectContaining({ method: 'link', start_country: 'SRB', start_city: 'Ниш', start_city_id: 787657 }),
		]);
		expect(posthog.named('link opened')).toHaveLength(1);
	});

	test('by geolocation on the first visit', async ({ page, context, ringApi, posthog }) => {
		await allowGeolocation(context, { lat: 45.25, lon: 19.84 });
		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));

		await openInProduction(page);

		await expect.poll(() => posthog.named('start set'), SENT).toEqual([
			expect.objectContaining({ method: 'geolocation', start_country: 'SRB', start_city: 'Нови-Сад', start_city_id: 3194360 }),
		]);
		expect(posthog.ours).not.toContain('link opened');
	});

	test('by search: the city picked', async ({ page, ringApi, posthog }) => {
		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));
		await openInProduction(page);

		await phrase(page).getByRole('button', { name: 'выберите' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('searchbox', { name: 'Найти город' }).fill('сег');
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: /^Сегед/u }).click();

		await expect.poll(() => posthog.named('start set'), SENT).toEqual([
			expect.objectContaining({ method: 'search', start_country: 'HUN', start_city: 'Сегед', start_city_id: 715429 }),
		]);
	});

	test('by the pin: the city nearest to it', async ({ page, ringApi, posthog }) => {
		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));
		await openInProduction(page, LINK);
		await expect(firstCard(page)).toContainText('В кольце 2–3 ч');

		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
		await page.getByRole('button', { name: 'Старт здесь' }).click();

		await expect.poll(() => posthog.named('start set'), SENT).toEqual([
			expect.objectContaining({ method: 'link', start_city: 'Белград' }),
			expect.objectContaining({ method: 'pin', start_country: 'SRB', start_city: 'Белград', start_city_id: 792680 }),
		]);
	});

	test('without the cities file: only the method', async ({ page, ringApi, posthog }) => {
		await page.route('**/data/cities.json', (route) => route.fulfill({ status: 404 }));
		ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));

		await openInProduction(page, LINK);

		await expect.poll(() => posthog.named('start set'), SENT).toHaveLength(1);
		const [startSet] = posthog.named('start set');
		expect(startSet).toMatchObject({ method: 'link' });
		for (const place of ['start_country', 'start_city', 'start_city_id']) {
			expect(startSet).not.toHaveProperty(place);
		}
	});
});

test.describe('geolocation failed', () => {
	test('denied: the browser did not let the site know where the person is', async ({ page, posthog }) => {
		await openInProduction(page);

		await expect(firstCard(page)).toContainText('Браузер не дал доступ к геолокации.');
		await expect.poll(() => posthog.named('geolocation failed'), SENT).toEqual([expect.objectContaining({ reason: 'denied' })]);
		expect(posthog.ours).toEqual(['geolocation failed']);
	});

	for (const reason of ['unavailable', 'timeout'] as const) {
		test(`${reason}, on load and from «Где я»`, async ({ page, context, posthog }) => {
			await failGeolocation(context, reason);
			await openInProduction(page);
			await expect(firstCard(page)).toContainText('Браузер не дал доступ к геолокации.');

			await firstCard(page).getByRole('button', { name: 'Где я' }).click();

			await expect.poll(() => posthog.named('geolocation failed'), SENT).toEqual([
				expect.objectContaining({ reason }),
				expect.objectContaining({ reason }),
			]);
		});
	}
});

test.describe('ring result', () => {
	/** Belgrade's ring 0–1.5° around it, Serbia and Hungary open: worked out from `CITIES`, 10 Serbian cities and Szeged. */
	const belgradeRing = (source: RingSource = 'calculation'): RingResponse => ({
		...squareRing(BELGRADE.lat, BELGRADE.lon, 0, 1.5),
		...visaRules({ SRB: { mode: 'visa_free', citizenship: 'RUS' }, HUN: { mode: 'visa_free', citizenship: 'RUS' } }),
		source,
	});

	test('tells the ring: N, the citizenships and held visas sorted, the place, the source, the wait and the cities', async ({ page, ringApi, posthog }) => {
		await holdTheClock(page);
		await openInProduction(page, '/#/?p=44.81760,20.45730&h=3&cit=RUS,SRB&visas=GEO,SCHENGEN');
		await ringApi.waitForCalls(1);
		await page.clock.runFor(1000);
		await ringApi.answer(belgradeRing());
		// The answer is in, at the held time, before the clock goes on.
		await runNowUntil(page, async () => /11\s*городов в 2 странах/u.test(await firstCard(page).innerText()));
		await page.clock.resume();

		await expect.poll(() => posthog.named('ring result'), SENT).toHaveLength(1);
		const [result] = posthog.named('ring result');
		expect(result).toMatchObject({
			outcome: 'ring',
			hours: 3,
			citizenships: ['RUS', 'SRB'],
			held_visas: ['GEO', 'SCHENGEN'],
			start_country: 'SRB',
			start_city: 'Белград',
			start_city_id: 792680,
			source: 'calculation',
			cities_count: 11,
			countries_count: 2,
		});
		expect(result.wait_ms).toBe(1000);
	});

	for (const source of ['cache', 'joined'] as const) {
		test(`tells the source ${source}`, async ({ page, ringApi, posthog }) => {
			ringApi.respond(() => belgradeRing(source));

			await openInProduction(page, LINK);

			await expect.poll(() => posthog.named('ring result'), SENT).toEqual([expect.objectContaining({ outcome: 'ring', source })]);
		});
	}

	test('from memory: source memory, wait 0, as it came', async ({ page, ringApi, posthog }) => {
		ringApi.respond(() => belgradeRing());
		await openInProduction(page, LINK);
		await expect(firstCard(page)).toContainText(/11\s*городов/u);
		await dragSlider(page, 5);
		await expect.poll(() => ringApi.calls, SENT).toHaveLength(2);

		await dragSlider(page, 3);

		await expect.poll(() => posthog.named('ring result').map(({ hours, source }) => [hours, source]), SENT).toEqual([
			[3, 'calculation'],
			[5, 'calculation'],
			[3, 'memory'],
		]);
		expect(posthog.named('ring result')[2]).toMatchObject({ outcome: 'ring', wait_ms: 0, cities_count: 11, countries_count: 2, start_city: 'Белград' });
		expect(ringApi.calls).toHaveLength(2);
	});

	const outcomes: [RingResultOutcome, RingReply, string][] = [
		['empty', { outcome: 'empty', maxHours: 2, startCountry: 'SRB', source: 'cache', ...visaRules() }, 'Дальше 2 ч не уехать'],
		['no_roads', { outcome: 'no_roads', startCountry: 'SRB', source: 'calculation', ...visaRules() }, 'Рядом нет дорог'],
		['no_ring', { outcome: 'no_ring', startCountry: 'UKR', source: 'cache', ...visaRules() }, 'Кольца нет'],
		['visa_rules_missing', { outcome: 'visa_rules_missing', missingCitizenship: 'RUS' }, 'визовые правила'],
		['too_many_requests', { status: 429 }, 'Слишком много'],
		['error', { status: 502 }, 'Не получилось'],
		['error', 'network error', 'Не получилось'],
	];
	for (const [outcome, reply, card] of outcomes) {
		test(`tells ${outcome}${reply === 'network error' ? ' when the network fails' : ''}`, async ({ page, ringApi, posthog }) => {
			ringApi.respond(() => reply);

			await openInProduction(page, LINK);

			await expect(firstCard(page)).toContainText(card);
			await expect.poll(() => posthog.named('ring result'), SENT).toHaveLength(1);
			const [result] = posthog.named('ring result');
			expect(result).toMatchObject({ outcome, hours: 3, citizenships: ['RUS'], held_visas: [], start_city: 'Белград' });
			expect(result).not.toHaveProperty('cities_count');
			if (typeof reply === 'object' && 'source' in reply) {
				expect(result.source).toBe(reply.source);
			} else {
				expect(result).not.toHaveProperty('source');
			}
		});
	}

	test('«Повторить» is a request of its own', async ({ page, ringApi, posthog }) => {
		ringApi.respond(() => ({ status: 502 }));
		await openInProduction(page, LINK);
		await expect(firstCard(page)).toContainText('Не получилось');

		ringApi.respond(() => belgradeRing());
		await firstCard(page).getByRole('button', { name: 'Повторить' }).click();

		await expect.poll(() => posthog.named('ring result').map(({ outcome }) => outcome), SENT).toEqual(['error', 'ring']);
	});

	test('a request the person moved on from is abandoned at once, and its late answer tells nothing', async ({ page, ringApi, posthog }) => {
		await holdTheClock(page);
		await openInProduction(page, LINK);
		await ringApi.waitForCalls(1);
		await page.clock.runFor(500);

		await dragSlider(page, 5);
		// The ring of 5 h is asked for, so the one of 3 h is abandoned, at the held time.
		await runNowUntil(page, () => ringApi.calls.length === 2);
		await page.clock.resume();
		await expect.poll(() => posthog.named('ring result'), SENT).toEqual([
			expect.objectContaining({ outcome: 'abandoned', hours: 3, start_city: 'Белград' }),
		]);
		await ringApi.answer(belgradeRing(), 5);
		await ringApi.answer(belgradeRing(), 3);

		await expect.poll(() => posthog.named('ring result').map(({ hours, outcome }) => [hours, outcome]), SENT).toEqual([
			[3, 'abandoned'],
			[5, 'ring'],
		]);
		const [abandoned] = posthog.named('ring result');
		expect(abandoned).not.toHaveProperty('source');
		expect(abandoned.wait_ms).toBe(500);

		// The late answer is in memory (its dot), and the next ring result follows the two: nothing came of it between.
		await expect.poll(() => dottedHours(page)).toEqual([3, 5]);
		ringApi.respond(() => belgradeRing());
		await slider(page).press('ArrowUp');
		await expect.poll(() => posthog.named('ring result').map(({ hours, outcome }) => [hours, outcome]), SENT).toEqual([
			[3, 'abandoned'],
			[5, 'ring'],
			[6, 'ring'],
		]);
	});

	test('a request the person left the page during is abandoned by beacon', async ({ page, ringApi, posthog }) => {
		await openInProduction(page, LINK);
		await ringApi.waitForCalls(1);
		await expect.poll(() => posthog.named('start set'), SENT).toHaveLength(1);

		await leave(page);

		await expect.poll(() => posthog.events.filter((sent) => sent.event === 'ring result'), SENT).toEqual([
			expect.objectContaining({ beacon: true, properties: expect.objectContaining({ outcome: 'abandoned', hours: 3, start_city: 'Белград' }) }),
		]);
	});

	test('none while the slider moves: only where it is let go', async ({ page, ringApi, posthog }) => {
		ringApi.respond(() => belgradeRing());
		await openInProduction(page, LINK);
		await expect(firstCard(page)).toContainText(/11\s*городов/u);

		await dragSlider(page, 8);

		await expect.poll(() => posthog.named('ring result').map(({ hours }) => hours), SENT).toEqual([3, 8]);
		// The next ring result follows the two: nothing came of the hours passed between.
		await slider(page).press('ArrowUp');
		await expect.poll(() => posthog.named('ring result').map(({ hours }) => hours), SENT).toEqual([3, 8, 9]);
	});
});

test('taps on the map are no dead clicks or rage clicks; a tap on text that does nothing is a dead click', async ({ page, ringApi, posthog }) => {
	// The project's dead clicks on, as the Owner may switch them.
	posthog.remoteConfig = { ...posthog.remoteConfig, captureDeadClicks: true };
	// PostHog waits a few seconds after a click for the page to change: the page's clock runs them.
	await page.clock.install();
	ringApi.respond((call) => squareRing(BELGRADE.lat, BELGRADE.lon, call.hours - 1, call.hours));
	await openInProduction(page, LINK);
	await expectRingCard(page, '2–3 ч');
	await mapAtRest(page);

	/** Three quick taps at the middle of `box`, as on a map that zooms by double taps. */
	const tapThrice = async (box: { x: number; y: number; width: number; height: number } | null) => {
		for (let tap = 0; tap < 3; tap++) {
			await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
		}
	};
	// The map, between the phrase and the carousel, where nothing is: the map moves, the page does not.
	const phraseBox = await phrase(page).boundingBox();
	await tapThrice({ x: 20, y: (phraseBox?.y ?? 0) + (phraseBox?.height ?? 0) + 40, width: 40, height: 40 });
	await page.clock.runFor(3500);
	// And the phrase's text, which does nothing either: PostHog does look.
	await tapThrice(await phrase(page).getByText('в пути').boundingBox());
	await page.clock.runFor(3500);
	await leave(page);

	// The element each was on, by the start of its chain.
	const chains = (event: string) => posthog.named(event).map((sent) => String(sent.$elements_chain).split(';')[0]);
	await expect.poll(() => chains('$dead_click'), SENT).toEqual([expect.stringMatching(/^p:/u)]);
	expect(chains('$rageclick')).toEqual([]);
});
