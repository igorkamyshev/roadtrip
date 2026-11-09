// The screen's layout (spec #20 «Экран»; #47): the panels over the map, the phrase, the slider, the carousel or the
// pin's bar and the data's sources of the first 5 s, never on one another nor off the screen, on the phones the
// screen is made for, with the longest phrase. Read by the elements' boxes, never by pixels.
import type { Locator, Page } from '@playwright/test';
import { expect, squareRing, test, visaRules } from './fixtures.ts';
import { expectRingCard, phrase, slider } from './screen.ts';

/** Where the page's clock stands, held, while the screen opens: the sources stay under the phrase. */
const START = Date.parse('2026-11-09T12:00:00Z');

/** Visa rules three days old: «визовые правила от 6 ноября» under the phrase. */
const OLD_RULES = '2026-11-06T12:00:00Z';

/** Belgrade at 12 h with four citizenships and four visas: the longest phrase. */
const LONGEST = '/#/?p=44.81760,20.45730&h=12&cit=BIH,MNE,RUS,SRB&visas=CAN,GBR,SCHENGEN,USA';
/** Belgrade at 12 h with one citizenship and no visas. */
const SHORTEST = '/#/?p=44.81760,20.45730&h=12&cit=RUS';

/** The phones of the ticket: small, the most common, large. */
const PHONES = [
	{ width: 360, height: 640 },
	{ width: 390, height: 844 },
	{ width: 430, height: 932 },
];

/** The slider's panel ends this far above the bottom of the screen, over the carousel (#44). */
const ABOVE_THE_CAROUSEL = 214;
/** The slider's panel is at most this high (#44). */
const TALLEST_SLIDER = 450;
/** The gap between the phrase and the slider under it (#47). */
const UNDER_THE_PHRASE = 8;
/** The slider is never lower than this, to be taken by a finger (#47). */
const LOWEST_SLIDER = 120;

interface Box {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

async function box(element: Locator): Promise<Box> {
	const found = await element.boundingBox();
	if (found === null) {
		throw new Error(`${String(element)} is not on the screen`);
	}
	return found;
}

/** The data's sources under the phrase, shown for 5 s once the screen opens. */
const sources = (page: Page): Locator => phrase(page).locator('p', { hasText: 'Источники данных' });

/** Whether two boxes share any area: touching edges do not. */
function overlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Each box inside the screen, and no two of them on one another. */
async function expectApart(page: Page, panels: Record<string, Locator>): Promise<void> {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	const boxes = await Promise.all(Object.entries(panels).map(async ([name, element]) => ({ name, box: await box(element) })));
	const off = boxes.filter(({ box: b }) => b.x < 0 || b.y < 0 || b.x + b.width > width || b.y + b.height > height).map(({ name }) => name);
	expect(off, 'panels off the screen').toEqual([]);
	const onOneAnother = boxes.flatMap((a, i) =>
		boxes.slice(i + 1).flatMap((b) => (overlap(a.box, b.box) ? [`${a.name} and ${b.name}`] : [])),
	);
	expect(onOneAnother, 'panels on one another').toEqual([]);
}

/** Opens `path` with the clock held 1 s after the load, and waits for the ring of 12 h. */
async function open(page: Page, path: string): Promise<void> {
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 1000);
	await page.goto(path);
	await expectRingCard(page, '11–12 ч');
}

test.beforeEach(({ ringApi }) => {
	ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), [0.05, 0.5]), ...visaRules(undefined, OLD_RULES) }));
});

for (const viewport of PHONES) {
	test.describe(`on ${viewport.width}×${viewport.height}`, () => {
		test.use({ viewport });

		test('the panels of the longest phrase are apart and on the screen', async ({ page }) => {
			await open(page, LONGEST);
			await expect(phrase(page).getByText('визовые правила от 6 ноября')).toBeVisible();

			await expectApart(page, {
				phrase: phrase(page),
				sources: sources(page),
				slider: slider(page),
				carousel: page.locator('.c-car'),
			});
		});

		test('in the pin mode, the panels of the longest phrase are apart and on the screen', async ({ page }) => {
			await open(page, LONGEST);
			await phrase(page).getByRole('button', { name: 'Белград' }).click();
			await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
			await expect(page.getByRole('button', { name: 'Старт здесь' })).toBeVisible();

			await expectApart(page, {
				phrase: phrase(page),
				sources: sources(page),
				'pin bar': page.locator('.c-pickbar'),
			});
		});

		for (const [phraseOf, path] of [
			['one citizenship', SHORTEST],
			['four citizenships', LONGEST],
		]) {
			test(`with ${phraseOf}, the slider ends over the carousel and starts 8 px under the phrase or 450 px up`, async ({ page }) => {
				await open(page, path);

				const phraseBox = await box(phrase(page));
				const sliderBox = await box(slider(page));
				const bottom = viewport.height - ABOVE_THE_CAROUSEL;
				expect(sliderBox.y + sliderBox.height).toBeCloseTo(bottom, 0);
				expect(sliderBox.y).toBeCloseTo(Math.max(phraseBox.y + phraseBox.height + UNDER_THE_PHRASE, bottom - TALLEST_SLIDER), 0);
				expect(sliderBox.height).toBeGreaterThanOrEqual(LOWEST_SLIDER);
			});
		}

		test('the slider stays where it is when the sources leave', async ({ page }) => {
			await open(page, LONGEST);
			await expect(sources(page)).toBeVisible();
			const before = await box(slider(page));

			await page.clock.runFor(5000);

			await expect(sources(page)).toHaveCount(0);
			expect(await box(slider(page))).toEqual(before);
		});
	});
}
