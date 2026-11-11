// The carousel with a mouse (spec #20 «Экран», «Карусель»; #99, #113): the plate ‹ › that steps the row, the part in
// view on the wide screen and a card on the narrow one, grey at the row's ends and gone where the row does not scroll
// or in the pin mode; the vertical wheel over the row; ← → on a card, which move the focus to the next one. On the wide
// screen none of it chooses a city; on the narrow one the row's stop does, as after a finger's swipe. Without a mouse
// there is none of it. Where the plate stands is `wide-layout.spec.ts`'s.
import type { Locator, Page } from '@playwright/test';
import { carouselRing, CITIES, expect, serveCities, servePlaces, test } from './fixtures.ts';
import {
	boxOf,
	carousel,
	carouselArrows,
	chosenCard,
	pointCard,
	pointCards,
	cutCard,
	EDGE,
	firstCard,
	holdTheClock,
	openTheCarousel,
	runUntil,
	scrolled,
	settle,
	startPinning,
} from './screen.ts';
import { DESKTOP, onWindow, windowName, WINDOWS } from './windows.ts';

/** A narrow window with a mouse: the phone's layout, with the arrows. */
const NARROW_WINDOW = { width: 719, height: 500 };

test.beforeEach(async ({ page, ringApi }) => {
	// The carousel's stop and the map's easing run by the page's clock: a test runs it past them.
	await holdTheClock(page);
	ringApi.respond(carouselRing);
});

const back = (page: Page): Locator => carouselArrows(page).getByRole('button', { name: 'Листать карточки назад' });
const forward = (page: Page): Locator => carouselArrows(page).getByRole('button', { name: 'Листать карточки вперёд' });

/** Where a card's left and right edges stand on the screen, to the pixel. */
async function edgesOf(card: Locator): Promise<{ left: number; right: number }> {
	const box = await boxOf(card);
	return { left: Math.round(box.x), right: Math.round(box.x + box.width) };
}

/** The name of the chosen city, read once the row has stopped. */
async function chosenAfterTheStop(page: Page): Promise<string[]> {
	await settle(page);
	return chosenCard(page).getByRole('heading').allInnerTexts();
}

/** The names of the cards of the points of interest, in order. */
const cardNames = async (page: Page): Promise<string[]> => pointCards(page).getByRole('heading').allInnerTexts();

/** Puts the mouse over the middle of the row's first card. */
async function overTheRow(page: Page): Promise<void> {
	const card = await boxOf(firstCard(page));
	await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
}

/** How far the row is scrolled from its start, to the pixel. */
const scrolledPx = async (page: Page): Promise<number> => Math.round(await scrolled(page));

/** Whether the city's card stands whole at the row's left edge, 12 px in: its left edge there, its right one in view. */
async function wholeAtTheLeftEdge(page: Page, name: string): Promise<boolean> {
	const { left, right } = await edgesOf(pointCard(page, name));
	return left === EDGE && right <= DESKTOP.width - EDGE;
}

test.describe(`on ${DESKTOP.width}×${DESKTOP.height}, mouse`, () => {
	test.use(onWindow(DESKTOP));

	test('an arrow steps the part of the row in view: forward the first card the right edge cuts comes to the left one, back the cards before the first whole one fill the view; no city is chosen', async ({
		page,
	}) => {
		await openTheCarousel(page);
		const names = await cardNames(page);

		// The card the right edge cuts, read where the cards stand before the step, comes whole to the left edge.
		const cut = await cutCard(page);
		expect(names.indexOf(cut)).toBeGreaterThan(0);
		await forward(page).click();
		await expect.poll(() => wholeAtTheLeftEdge(page, cut)).toBe(true);

		const next = await cutCard(page);
		expect(names.indexOf(next)).toBeGreaterThan(names.indexOf(cut));
		await forward(page).click();
		await expect.poll(() => wholeAtTheLeftEdge(page, next)).toBe(true);

		// Back from there, the card before the one at the left edge comes to the right edge.
		const before = names[names.indexOf(next) - 1] ?? '';
		await back(page).click();
		await expect.poll(async () => (await edgesOf(pointCard(page, before))).right).toBe(DESKTOP.width - EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('at the start of the row the back arrow is grey and does nothing, at its end the forward one; the plate stays as it is', async ({
		page,
	}) => {
		await openTheCarousel(page);
		const plate = await boxOf(carouselArrows(page));
		await expect(back(page)).toBeDisabled();
		await expect(forward(page)).toBeEnabled();

		await carousel(page).evaluate((element) => {
			element.scrollLeft = element.scrollWidth;
		});

		await expect(forward(page)).toBeDisabled();
		await expect(back(page)).toBeEnabled();
		expect(await boxOf(carouselArrows(page))).toEqual(plate);
	});

	test('the arrows are out of the order of Tab', async ({ page }) => {
		await openTheCarousel(page);

		await expect(back(page)).toHaveAttribute('tabindex', '-1');
		await expect(forward(page)).toHaveAttribute('tabindex', '-1');
	});

	test('the vertical wheel over the row scrolls it by its turn, both ways, and chooses no city', async ({ page }) => {
		await openTheCarousel(page);
		await overTheRow(page);

		await page.mouse.wheel(0, 300);
		await expect.poll(() => scrolledPx(page)).toBe(300);
		await page.mouse.wheel(0, -100);
		await expect.poll(() => scrolledPx(page)).toBe(200);

		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('← and → on a card move the focus to the next one, and the row follows it; no city is chosen', async ({ page }) => {
		await openTheCarousel(page);
		const names = await cardNames(page);
		const cut = await cutCard(page);
		await pointCards(page).first().getByRole('button').focus();

		// From the first card of a point of interest on to the one the right edge cuts.
		for (let press = 0; press < names.indexOf(cut); press += 1) {
			await page.keyboard.press('ArrowRight');
		}

		await expect(pointCard(page, cut).getByRole('button')).toBeFocused();
		await expect
			.poll(async () => {
				const { left, right } = await edgesOf(pointCard(page, cut));
				return left >= EDGE && right <= DESKTOP.width - EDGE;
			})
			.toBe(true);
		await page.keyboard.press('ArrowLeft');
		await expect(pointCard(page, names[names.indexOf(cut) - 1] ?? '').getByRole('button')).toBeFocused();
		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('the plate is there while the row scrolls, and goes with no origin, in the pin mode and with one city', async ({ page }) => {
		await page.goto('/');
		await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');
		await expect(carouselArrows(page)).toHaveCount(0);

		await openTheCarousel(page);
		await expect(carouselArrows(page)).toBeVisible();

		await startPinning(page);
		await expect(carouselArrows(page)).toHaveCount(0);
		await page.getByTestId('pin-bar').getByRole('button', { name: 'Отмена' }).click();
		await expect(carouselArrows(page)).toBeVisible();

		await serveCities(
			page,
			CITIES.filter(([, name]) => name === 'Будапешт'),
		);
		await servePlaces(page, []);
		await page.reload();
		await runUntil(page, async () => (await pointCards(page).count()) === 1, 'the one city card');
		await expect(carouselArrows(page)).toHaveCount(0);
	});
});

test.describe(`on ${NARROW_WINDOW.width}×${NARROW_WINDOW.height}, mouse`, () => {
	test.use({ viewport: NARROW_WINDOW });

	test('an arrow steps one card, and the stop chooses the city at the left edge', async ({ page }) => {
		await openTheCarousel(page);
		const [first, second] = await cardNames(page);

		await forward(page).click();
		await expect.poll(async () => (await edgesOf(pointCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);

		await forward(page).click();
		await expect.poll(async () => (await edgesOf(pointCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);

		await back(page).click();
		await expect.poll(async () => (await edgesOf(pointCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);
	});

	test('a turn of the wheel over the row steps one card, and the stop chooses its city', async ({ page }) => {
		await openTheCarousel(page);
		const [first, second] = await cardNames(page);
		await overTheRow(page);

		await page.mouse.wheel(0, 100);
		await expect.poll(async () => (await edgesOf(pointCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);

		await page.mouse.wheel(0, 100);
		await expect.poll(async () => (await edgesOf(pointCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);
	});

	test('→ on a card moves the focus to the next one, which comes to the left edge, and the stop chooses its city', async ({ page }) => {
		await openTheCarousel(page);
		const [, second] = await cardNames(page);
		await pointCards(page).first().getByRole('button').focus();

		await page.keyboard.press('ArrowRight');

		await expect(pointCards(page).nth(1).getByRole('button')).toBeFocused();
		await expect.poll(async () => (await edgesOf(pointCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);
	});

	test('the plate is there while the row scrolls, and goes with no origin, where the first card is all the row holds, and in the pin mode', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');
		await expect(carouselArrows(page)).toHaveCount(0);

		await openTheCarousel(page);
		await expect(carouselArrows(page)).toBeVisible();

		await startPinning(page);
		await expect(carouselArrows(page)).toHaveCount(0);
	});
});

for (const window of WINDOWS.filter(({ width, height }) => width === 768 && height === 1024)) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('without a mouse the vertical wheel and ← → are the browser’s: the wheel leaves the row, → leaves the focus', async ({ page }) => {
			await openTheCarousel(page);
			await pointCards(page).first().getByRole('button').focus();
			await overTheRow(page);

			await page.mouse.wheel(0, 300);
			await settle(page);
			expect(await scrolled(page)).toBe(0);

			await page.keyboard.press('ArrowRight');
			await expect(pointCards(page).first().getByRole('button')).toBeFocused();
		});
	});
}
