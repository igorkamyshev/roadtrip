// Hover and the cursor over the map (spec #20 «Экран»; #105): with a mouse, at any width, what a click does
// something on answers the mouse over it with its colour, and only that; without a mouse nothing does, though a
// test's mouse still moves over the page. Over a city on the map the cursor shows it can be clicked, where a click
// would pick it, mouse or not; elsewhere the map's own grab, and grab everywhere in the pin mode.
import type { Locator, Page } from '@playwright/test';
import { BELGRADE, expect, LINK_3_HOURS, squareRing, test, visaRules } from './fixtures.ts';
import { cityCards, firstCard, mapAtRest, startPinning, theMap, whereOnScreen } from './screen.ts';
import { DESKTOP, onWindow, type TestWindow, windowName, WINDOWS } from './windows.ts';

/** A city of the ring 2–3 h around Belgrade, on the map clear of the panels at 1440×900. */
const SUBOTICA = { lat: 46.1, lon: 19.667 };

/** A phone's window with a mouse: a narrow screen on a computer. */
const NARROW_WITH_A_MOUSE: TestWindow = { width: 390, height: 844, pointer: 'mouse', layout: 'narrow' };

/** The ticket's windows: a desktop and a narrow window with a mouse; a phone and a tablet upright without one. */
const HOVER_WINDOWS: readonly TestWindow[] = [
	...WINDOWS.filter(
		({ width, height }) => (width === 1440 && height === 900) || (width === 390 && height === 844) || (width === 768 && height === 1024),
	),
	NARROW_WITH_A_MOUSE,
];
const WITH_A_MOUSE = HOVER_WINDOWS.filter((window) => window.pointer === 'mouse');
const WITHOUT_A_MOUSE = HOVER_WINDOWS.filter((window) => window.pointer === 'touch');

test.beforeEach(({ ringApi }) => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules() }));
});

/** An element's background as it is painted: its colour and whatever lies over it. */
async function backgroundOf(element: Locator): Promise<string> {
	return element.evaluate((node) => {
		const style = getComputedStyle(node);
		return `${style.backgroundColor} ${style.backgroundImage}`;
	});
}

/** The element's background with the mouse away from it, then with the mouse over `target`, a part of it. */
async function underTheMouse(page: Page, element: Locator, target: Locator = element): Promise<{ away: string; over: string }> {
	await page.mouse.move(0, 0);
	const away = await backgroundOf(element);
	await target.hover();
	return { away, over: await backgroundOf(element) };
}

/** The cursor the map's canvas shows. */
async function cursorOverTheMap(page: Page): Promise<string> {
	return theMap(page).evaluate((canvas) => getComputedStyle(canvas).cursor);
}

/** Moves the mouse over the place on the map, once the camera has stopped. */
async function mouseOver(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await mapAtRest(page);
	const { x, y } = await whereOnScreen(page, at);
	await page.mouse.move(x, y);
}

/** A city card's background with the mouse away from it and over it, on its name. */
async function cityCardUnderTheMouse(page: Page): Promise<{ away: string; over: string }> {
	await page.goto(LINK_3_HOURS);
	const card = cityCards(page).first();
	await expect(card).toBeVisible();
	return underTheMouse(page, card, card.getByRole('heading'));
}

for (const window of WITH_A_MOUSE) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('a city card under the mouse changes its background', async ({ page }) => {
			const { away, over } = await cityCardUnderTheMouse(page);

			expect(over).not.toBe(away);
		});
	});
}

for (const window of WITHOUT_A_MOUSE) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('a city card keeps its background under a mouse the screen does not know of', async ({ page }) => {
			const { away, over } = await cityCardUnderTheMouse(page);

			expect(over).toBe(away);
		});
	});
}

test.describe('on 1440×900, mouse', () => {
	test.use(onWindow(DESKTOP));

	test('a card that cannot be clicked, one with an error, keeps its background under the mouse; its «Повторить» answers', async ({
		page,
		ringApi,
	}) => {
		ringApi.respond(() => ({ status: 502 }));
		await page.goto(LINK_3_HOURS);
		await expect(firstCard(page)).toHaveAttribute('data-state', 'error');

		const card = await underTheMouse(page, firstCard(page), firstCard(page).getByRole('heading'));
		expect(card.over).toBe(card.away);

		const retry = await underTheMouse(page, firstCard(page).getByRole('button', { name: 'Повторить' }));
		expect(retry.over).not.toBe(retry.away);
	});

	test("the cursor is a pointer over a city on the map, the map's grab beside it, and grab over it in the pin mode", async ({ page }) => {
		await page.goto(LINK_3_HOURS);
		await expect(cityCards(page)).not.toHaveCount(0);

		await mouseOver(page, SUBOTICA);
		await expect.poll(() => cursorOverTheMap(page)).toBe('pointer');

		// The origin, in the middle of the ring: no city near it.
		await mouseOver(page, BELGRADE);
		await expect.poll(() => cursorOverTheMap(page)).toBe('grab');

		await mouseOver(page, SUBOTICA);
		await expect.poll(() => cursorOverTheMap(page)).toBe('pointer');
		await startPinning(page);
		await expect(page.getByTestId('pin-bar')).toBeVisible();
		await mouseOver(page, SUBOTICA);
		expect(await cursorOverTheMap(page)).toBe('grab');
	});
});
