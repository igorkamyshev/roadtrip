// The carousel with a mouse (spec #20 «Экран», «Карусель»; #99, #113): the plate ‹ › that steps the row, the part in
// view on the wide screen and a card on the narrow one, grey at the row's ends and gone where the row does not scroll
// or in the pin mode; the vertical wheel over the row; ← → on a card, which move the focus to the next one. On the wide
// screen none of it chooses a city; on the narrow one the row's stop does, as after a finger's swipe. Without a mouse
// there is none of it. Where the plate stands is `wide-layout.spec.ts`'s.
import type { Locator, Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { CITIES, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import { boxOf, carousel, carouselArrows, chosenCard, cityCards, firstCard, mapAtRest, startPinning } from './screen.ts';
import { onWindow, windowName, WINDOWS } from './windows.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
/** Belgrade at 2–3 h: 12 city cards and «и ещё», a row that scrolls on any window. */
const LINK = '/#/?p=44.81760,20.45730&h=3&cit=RUS';
const OPEN: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'visa_free', citizenship: 'RUS' },
	ROU: { mode: 'visa_free', citizenship: 'RUS' },
	HRV: { mode: 'visa_free', citizenship: 'RUS' },
};

/** The row's room for its cards on the wide screen, and where the narrow screen's current card stands: 12 px in. */
const EDGE = 12;

const DESKTOP = { width: 1440, height: 900 };
/** A narrow window with a mouse: the phone's layout, with the arrows. */
const NARROW_WINDOW = { width: 719, height: 500 };

test.beforeEach(async ({ page, ringApi }) => {
	// The page's clock, which the carousel's stop runs by: a test moves it past the stop.
	await page.clock.install();
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN) }));
});

/** Opens the ring 2–3 h around Belgrade with its 12 city cards. */
async function open(page: Page): Promise<void> {
	await page.goto(LINK);
	await expect(cityCards(page)).toHaveCount(12);
	await mapAtRest(page);
}

/** Lets the carousel's stop come, and the map's easing after it. */
async function settle(page: Page): Promise<void> {
	await page.clock.fastForward(2000);
	await mapAtRest(page);
}

const back = (page: Page): Locator => carouselArrows(page).getByRole('button', { name: 'Листать карточки назад' });
const forward = (page: Page): Locator => carouselArrows(page).getByRole('button', { name: 'Листать карточки вперёд' });

/** Where a card's left and right edges stand on the screen, to the pixel. */
async function edgesOf(card: Locator): Promise<{ left: number; right: number }> {
	const box = await boxOf(card);
	return { left: Math.round(box.x), right: Math.round(box.x + box.width) };
}

/** The index of the first city card the row's right edge cuts, its 12 px in. */
async function firstCutOnTheRight(page: Page): Promise<number> {
	const { width } = page.viewportSize() ?? DESKTOP;
	const rights = await cityCards(page).evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().right));
	return rights.findIndex((right) => right > width - EDGE + 0.5);
}

/** The name of the chosen city, read once the row has stopped. */
async function chosenAfterTheStop(page: Page): Promise<string[]> {
	await settle(page);
	return chosenCard(page).getByRole('heading').allInnerTexts();
}

/** The names of the city cards in order. */
const cityNames = async (page: Page): Promise<string[]> => cityCards(page).getByRole('heading').allInnerTexts();

/** Puts the mouse over the middle of the row's first card. */
async function overTheRow(page: Page): Promise<void> {
	const card = await boxOf(firstCard(page));
	await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
}

/** How far the row is scrolled from its start. */
const scrolled = async (page: Page): Promise<number> => carousel(page).evaluate((element) => Math.round(element.scrollLeft));

test.describe(`on ${DESKTOP.width}×${DESKTOP.height}, mouse`, () => {
	test.use({ viewport: DESKTOP });

	test('an arrow steps the part of the row in view: forward the first card the right edge cuts comes to the left one, back the cards before the first whole one fill the view; no city is chosen', async ({
		page,
	}) => {
		await open(page);

		const first = await firstCutOnTheRight(page);
		expect(first).toBeGreaterThan(0);
		await forward(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(first))).left).toBe(EDGE);

		const second = await firstCutOnTheRight(page);
		expect(second).toBeGreaterThan(first);
		await forward(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(second))).left).toBe(EDGE);

		await back(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(second - 1))).right).toBe(DESKTOP.width - EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('at the start of the row the back arrow is grey and does nothing, at its end the forward one; the plate stays as it is', async ({
		page,
	}) => {
		await open(page);
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
		await open(page);

		await expect(back(page)).toHaveAttribute('tabindex', '-1');
		await expect(forward(page)).toHaveAttribute('tabindex', '-1');
	});

	test('the vertical wheel over the row scrolls it by its turn, both ways, and chooses no city', async ({ page }) => {
		await open(page);
		await overTheRow(page);

		await page.mouse.wheel(0, 300);
		await expect.poll(() => scrolled(page)).toBe(300);
		await page.mouse.wheel(0, -100);
		await expect.poll(() => scrolled(page)).toBe(200);

		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('← and → on a card move the focus to the next one, and the row follows it; no city is chosen', async ({ page }) => {
		await open(page);
		const cut = await firstCutOnTheRight(page);
		await cityCards(page).first().getByRole('button').focus();

		for (let press = 0; press < cut; press += 1) {
			await page.keyboard.press('ArrowRight');
		}

		await expect(cityCards(page).nth(cut).getByRole('button')).toBeFocused();
		await expect
			.poll(async () => {
				const { left, right } = await edgesOf(cityCards(page).nth(cut));
				return left >= EDGE && right <= DESKTOP.width - EDGE;
			})
			.toBe(true);
		await page.keyboard.press('ArrowLeft');
		await expect(
			cityCards(page)
				.nth(cut - 1)
				.getByRole('button'),
		).toBeFocused();
		expect(await chosenAfterTheStop(page)).toEqual([]);
	});

	test('the plate is there while the row scrolls, and goes with no origin, in the pin mode and with one city', async ({ page }) => {
		await page.goto('/');
		await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');
		await expect(carouselArrows(page)).toHaveCount(0);

		await open(page);
		await expect(carouselArrows(page)).toBeVisible();

		await startPinning(page);
		await expect(carouselArrows(page)).toHaveCount(0);
		await page.getByTestId('pin-bar').getByRole('button', { name: 'Отмена' }).click();
		await expect(carouselArrows(page)).toBeVisible();

		await serveCities(
			page,
			CITIES.filter(([, name]) => name === 'Будапешт'),
		);
		await page.reload();
		await expect(cityCards(page)).toHaveCount(1);
		await expect(carouselArrows(page)).toHaveCount(0);
	});
});

test.describe(`on ${NARROW_WINDOW.width}×${NARROW_WINDOW.height}, mouse`, () => {
	test.use({ viewport: NARROW_WINDOW });

	test('an arrow steps one card, and the stop chooses the city at the left edge', async ({ page }) => {
		await open(page);
		const [first, second] = await cityNames(page);

		await forward(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);

		await forward(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);

		await back(page).click();
		await expect.poll(async () => (await edgesOf(cityCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);
	});

	test('a turn of the wheel over the row steps one card, and the stop chooses its city', async ({ page }) => {
		await open(page);
		const [first, second] = await cityNames(page);
		await overTheRow(page);

		await page.mouse.wheel(0, 100);
		await expect.poll(async () => (await edgesOf(cityCards(page).first())).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([first]);

		await page.mouse.wheel(0, 100);
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);
	});

	test('→ on a card moves the focus to the next one, which comes to the left edge, and the stop chooses its city', async ({ page }) => {
		await open(page);
		const [, second] = await cityNames(page);
		await cityCards(page).first().getByRole('button').focus();

		await page.keyboard.press('ArrowRight');

		await expect(cityCards(page).nth(1).getByRole('button')).toBeFocused();
		await expect.poll(async () => (await edgesOf(cityCards(page).nth(1))).left).toBe(EDGE);
		expect(await chosenAfterTheStop(page)).toEqual([second]);
	});

	test('the plate is there while the row scrolls, and goes with no origin, where the first card is all the row holds, and in the pin mode', async ({
		page,
	}) => {
		await page.goto('/');
		await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');
		await expect(carouselArrows(page)).toHaveCount(0);

		await open(page);
		await expect(carouselArrows(page)).toBeVisible();

		await startPinning(page);
		await expect(carouselArrows(page)).toHaveCount(0);
	});
});

for (const window of WINDOWS.filter(({ width, height }) => width === 768 && height === 1024)) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('without a mouse the vertical wheel and ← → are the browser’s: the wheel leaves the row, → leaves the focus', async ({ page }) => {
			await open(page);
			await cityCards(page).first().getByRole('button').focus();
			await overTheRow(page);

			await page.mouse.wheel(0, 300);
			await settle(page);
			expect(await scrolled(page)).toBe(0);

			await page.keyboard.press('ArrowRight');
			await expect(cityCards(page).first().getByRole('button')).toBeFocused();
		});
	});
}
