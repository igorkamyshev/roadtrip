// The screen's layout (spec #20 «Экран»; #47, #85, #77): the panels over the map, the phrase, the slider, the
// carousel's current card or the pin's bar and the data's sources of the first 5 s, never on one another nor off the
// screen, each 12 px from its edges of the screen, on the phones the screen is made for, with the longest phrase and
// the shortest. The sources are as wide as the phrase, and their place stays when they go. The slider goes down to
// the bottom of the screen over the carousel, and the current card leaves room for the next one to peek out. Read by
// the elements' boxes, never by pixels.
import type { Page } from '@playwright/test';
import { expect, LONGEST, LONGEST_IN_DAYS, OLD_RULES, SHORTEST, squareRing, test, visaRules } from './fixtures.ts';
import {
	BETWEEN,
	boxOf,
	pointCards,
	EDGE,
	expectApart,
	firstCard,
	fromEdges,
	LAST_DAY_RING,
	LAST_HOUR_RING,
	openHeld,
	overlap,
	phrase,
	rulesDate,
	runUntil,
	slider,
	sliderHour,
	sliderPanel,
	sliderTab,
	sources,
	startPinning,
} from './screen.ts';

/**
 * The phones of the tickets: small, the most common, large; and what Safari leaves of the iPhone 15/16 and the
 * iPhone SE under its bars (#85), with the slider's hour no lower than this there. The SE's was 27 px until the place
 * of the data's sources stayed under the phrase (#77): three lines of them there.
 */
const PHONES = [
	{ width: 360, height: 640 },
	{ width: 390, height: 844 },
	{ width: 430, height: 932 },
	{ width: 393, height: 660, lowestHour: 31 },
	{ width: 375, height: 550, lowestHour: 22 },
];

/** What shows of the next card of the carousel, between the current one and the slider (#77). */
const PEEK = 64;
/** The slider's panel is at most this high (#44). */
const TALLEST_SLIDER = 450;
/** The gap between the phrase and the slider under it (#47). */
const UNDER_THE_PHRASE = 8;
/** The slider is never lower than this, to be taken by a finger (#47). */
const LOWEST_SLIDER = 120;

/**
 * Waits for the cities file, which the phrase names Belgrade by, and the cards of the ring's cities. A file that comes
 * once the clock is held shows only as the clock runs: a frame at a time, far from the sources' 5 s.
 */
async function citiesCame(page: Page): Promise<void> {
	await runUntil(page, async () => (await pointCards(page).count()) > 0, 'the cards of the ring’s cities');
}

test.beforeEach(({ ringApi }) => {
	ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), [0.05, 0.5]), ...visaRules(undefined, OLD_RULES) }));
});

for (const { lowestHour, ...viewport } of PHONES) {
	test.describe(`on ${viewport.width}×${viewport.height}`, () => {
		test.use({ viewport });

		test('the panels of the longest phrase are apart and on the screen', async ({ page }) => {
			await openHeld(page, LONGEST);
			await expect(rulesDate(page)).toBeVisible();

			await expectApart(page, {
				phrase: phrase(page),
				sources: sources(page),
				slider: slider(page),
				'current card': firstCard(page),
			});
		});

		test('the data’s sources are as wide as the phrase', async ({ page }) => {
			await openHeld(page, LONGEST);

			const [phraseBox, sourcesBox] = await Promise.all([boxOf(phrase(page)), boxOf(sources(page))]);
			expect(sourcesBox.x).toBeCloseTo(phraseBox.x, 0);
			expect(sourcesBox.width).toBeCloseTo(phraseBox.width, 0);
		});

		test('the current card leaves 64 px for the next one to peek out before the slider', async ({ page }) => {
			await openHeld(page, SHORTEST);

			const [cardBox, sliderBox] = await Promise.all([boxOf(firstCard(page)), boxOf(slider(page))]);
			expect(sliderBox.x - (cardBox.x + cardBox.width)).toBeGreaterThanOrEqual(BETWEEN + PEEK - 0.5);
		});

		for (const [unit, path, ring] of [
			['hours', LONGEST, LAST_HOUR_RING],
			['days', LONGEST_IN_DAYS, LAST_DAY_RING],
		]) {
			test(`in ${unit}, the slider's tab and panel are apart from the phrase and the current card, and on the screen`, async ({ page }) => {
				await openHeld(page, path, ring);

				await expectApart(page, { phrase: phrase(page), 'slider tab': sliderTab(page), 'current card': firstCard(page) });
				await expectApart(page, { phrase: phrase(page), 'slider panel': sliderPanel(page), 'current card': firstCard(page) });
				const sliderBox = await boxOf(slider(page));
				expect(fromEdges(page, sliderBox)).toMatchObject({ right: EDGE, bottom: EDGE });
			});
		}

		test('the phrase, the slider and the current card stand 12 px from their edges of the screen', async ({ page }) => {
			await openHeld(page, LONGEST);

			const [phraseBox, sliderBox, cardBox] = await Promise.all([boxOf(phrase(page)), boxOf(slider(page)), boxOf(firstCard(page))]);
			expect(fromEdges(page, phraseBox)).toMatchObject({ top: EDGE, right: EDGE, left: EDGE });
			expect(fromEdges(page, sliderBox)).toMatchObject({ right: EDGE, bottom: EDGE });
			expect(fromEdges(page, cardBox)).toMatchObject({ bottom: EDGE, left: EDGE });
		});

		test('in the pin mode, the panels of the longest phrase are apart and on the screen', async ({ page }) => {
			await openHeld(page, LONGEST);
			await citiesCame(page);
			await startPinning(page);
			await expect(page.getByRole('button', { name: 'Старт здесь' })).toBeVisible();

			await expectApart(page, {
				phrase: phrase(page),
				sources: sources(page),
				'pin bar': page.getByTestId('pin-bar'),
			});
			expect(fromEdges(page, await boxOf(page.getByTestId('pin-bar')))).toMatchObject({ right: EDGE, bottom: EDGE, left: EDGE });
		});

		for (const [settings, path] of [
			['one citizenship', SHORTEST],
			['four citizenships', LONGEST],
		]) {
			test(`with ${settings}, the slider ends 12 px over the bottom and starts 8 px under the sources or 450 px up`, async ({ page }) => {
				await openHeld(page, path);

				const [phraseBox, sourcesBox, sliderBox, cardBox] = await Promise.all([
					boxOf(phrase(page)),
					boxOf(sources(page)),
					boxOf(slider(page)),
					boxOf(firstCard(page)),
				]);
				const bottom = viewport.height - EDGE;
				expect(sourcesBox.y).toBeCloseTo(phraseBox.y + phraseBox.height + UNDER_THE_PHRASE, 0);
				expect(sliderBox.y + sliderBox.height).toBeCloseTo(bottom, 0);
				expect(sliderBox.y).toBeCloseTo(Math.max(sourcesBox.y + sourcesBox.height + UNDER_THE_PHRASE, bottom - TALLEST_SLIDER), 0);
				expect(sliderBox.height).toBeGreaterThanOrEqual(LOWEST_SLIDER);
				expect(overlap(sliderBox, phraseBox), 'the slider on the phrase').toBe(false);
				expect(overlap(sliderBox, cardBox), 'the slider on the current card').toBe(false);
			});
		}

		// Read with the shortest phrase and fresh visa rules, as on the prototype (#85, #83): under the longest one, with
		// its date of the visa rules, the slider of a short screen keeps only its 120 px. The tab «дни ↑» is over it.
		for (const lowest of lowestHour === undefined ? [] : [lowestHour]) {
			test(`with one citizenship, an hour of the slider is ${lowest} px high or more`, async ({ page, ringApi }) => {
				ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), [0.05, 0.5]), ...visaRules() }));
				await openHeld(page, SHORTEST);
				await expect(sliderTab(page)).toBeVisible();

				expect((await boxOf(sliderHour(page, 1))).height).toBeGreaterThanOrEqual(lowest);
			});
		}

		test('the slider stays where it is when the sources leave, under their empty place', async ({ page }) => {
			await openHeld(page, LONGEST);
			await expect(sources(page)).toBeVisible();
			const before = await boxOf(slider(page));

			await page.clock.runFor(5000);

			await expect(sources(page)).toBeHidden();
			expect(await boxOf(slider(page))).toEqual(before);
		});
	});
}
