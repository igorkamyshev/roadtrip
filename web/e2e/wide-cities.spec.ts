// The carousel and the map on the wide screen (spec #20 «Экран», «Карусель»; #104): the row only scrolls, and its
// stop chooses nothing; a click or a tap on a card, a city tapped on the map and one picked in the list of all choose
// a city, the map goes to it at once, and the row moves only to show its card whole. A window that turns narrow puts
// the chosen city's card at the left edge, where the narrow screen's chosen card stands. And at any width the
// keyboard's focus looks other than the chosen card's mark. The narrow screen's carousel is `cities.spec.ts`'s.
import type { Locator, Page } from '@playwright/test';
import { carouselRing, CITIES, expect, test } from './fixtures.ts';
import {
	boxOf,
	carousel,
	chosenCard,
	cityCard,
	cityCards,
	cutCard,
	dragMap,
	holdTheClock,
	labelsOnMap,
	mapCenter,
	mapZoom,
	openTheCarousel,
	runUntil,
	scrolled,
	settle,
	tapMap,
} from './screen.ts';
import { onWindow, type TestWindow, windowName, WINDOWS } from './windows.ts';

/** The windows of the ticket's checks: a desktop with a mouse, and a tablet upright with a touch screen. */
const CHECKED = WINDOWS.filter(({ width, height }) => (width === 1440 && height === 900) || (width === 768 && height === 1024));

test.beforeEach(async ({ page, ringApi }) => {
	// The map's easing and the carousel's stop run by the page's clock: a test runs it past them.
	await holdTheClock(page);
	ringApi.respond(carouselRing);
});

/** Where a city of `CITIES` is. */
function placeOf(name: string): { lat: number; lon: number } {
	const row = CITIES.find(([, cityName]) => cityName === name);
	if (row === undefined) {
		throw new Error(`no city ${name} in CITIES`);
	}
	return { lat: row[3], lon: row[4] };
}

/**
 * How far, in pixels, the city is from the middle of the map, once the camera has stopped: the camera puts a city it
 * goes to near it, wherever the panels leave room.
 */
async function fromTheMapMiddle(page: Page, name: string): Promise<number> {
	await settle(page);
	const { lat, lon } = placeOf(name);
	const [box, at] = await Promise.all([
		boxOf(page.getByTestId('map')),
		page.evaluate(([y, x]) => window.mapForTests?.project([x, y]), [lat, lon]),
	]);
	if (at === undefined) {
		throw new Error('the map the client announced is gone');
	}
	return Math.hypot(at.x - box.width / 2, at.y - box.height / 2);
}

/** The camera went to a city when it stands this close to the map's middle. */
const WENT_TO = 80;

/** The row's room for its cards: inside the 12 px of either edge, where it fades out (#104). */
const EDGE = 12;

/**
 * Clicks, or taps on a touch screen, the card where the row shows it, on its heading's line: a click of Playwright's
 * would scroll a card cut by the edge into view first. Gives the point it pressed.
 */
async function pressCard(page: Page, pointer: TestWindow['pointer'], name: string): Promise<{ x: number; y: number }> {
	const { width } = page.viewportSize() ?? { width: 0 };
	const [card, heading] = await Promise.all([boxOf(cityCard(page, name)), boxOf(cityCard(page, name).getByRole('heading'))]);
	const at = { x: (Math.max(card.x, EDGE) + Math.min(card.x + card.width, width - EDGE)) / 2, y: heading.y + heading.height / 2 };
	await (pointer === 'touch' ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y));
	return at;
}

/** Where the city's card stands whole in the row: at its left or right edge, between them, or `cut` by one. */
async function wholeAt(page: Page, name: string): Promise<'left' | 'right' | 'between' | 'cut'> {
	const { width } = page.viewportSize() ?? { width: 0 };
	const box = await boxOf(cityCard(page, name));
	const [left, right] = [Math.round(box.x), Math.round(box.x + box.width)];
	if (left < EDGE || right > width - EDGE) {
		return 'cut';
	}
	if (left === EDGE) {
		return 'left';
	}
	return right === width - EDGE ? 'right' : 'between';
}

/**
 * Picks a city in the list of all. The list opens from a tap on the map at Reşiţa, a city with no card, which leaves
 * the row where it is: «и ещё», at the row's end, would scroll it.
 */
async function pickInTheList(page: Page, name: string): Promise<void> {
	await tapMap(page, placeOf('Решица'));
	await page
		.getByRole('dialog', { name: /в кольце/u })
		.getByTestId('city-row')
		.filter({ hasText: name })
		.click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const window of CHECKED) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('scrolling the row chooses no city and leaves the map where it is', async ({ page }) => {
			await openTheCarousel(page);
			const center = await mapCenter(page);

			await carousel(page).evaluate((element) => {
				element.scrollLeft = 600;
			});
			await settle(page);

			await expect(chosenCard(page)).toHaveCount(0);
			expect((await labelsOnMap(page)).chosen).toEqual([]);
			expect(await mapCenter(page)).toEqual(center);
		});

		test('a card the edge cuts, pressed, chooses its city: the map goes to it, and the row moves only to show the card whole', async ({
			page,
		}) => {
			await openTheCarousel(page);
			const name = await cutCard(page);
			const { width } = page.viewportSize() ?? { width: 0 };
			const cut = await boxOf(cityCard(page, name));
			const cutBy = cut.x + cut.width - (width - EDGE);
			const [zoom, before] = await Promise.all([mapZoom(page), scrolled(page)]);
			expect(await fromTheMapMiddle(page, name)).toBeGreaterThan(WENT_TO);

			const pressed = await pressCard(page, window.pointer, name);

			await expect(chosenCard(page).getByRole('heading')).toHaveText(name);
			await expect.poll(async () => Math.round((await scrolled(page)) - before)).toBe(Math.round(cutBy));
			const card = await boxOf(cityCard(page, name));
			expect(Math.round(card.x + card.width)).toBe(width - EDGE);
			expect(pressed.x).toBeGreaterThan(card.x);
			expect(pressed.x).toBeLessThan(card.x + card.width);
			expect(await fromTheMapMiddle(page, name)).toBeLessThan(WENT_TO);
			expect(await mapZoom(page)).toBeCloseTo(zoom);

			// Pressed again once the map was led away, the chosen card brings it back, at the zoom it has (#76).
			await dragMap(page, -200, -150);
			expect(await fromTheMapMiddle(page, name)).toBeGreaterThan(WENT_TO);
			const dragged = await mapZoom(page);

			await pressCard(page, window.pointer, name);

			expect(await fromTheMapMiddle(page, name)).toBeLessThan(WENT_TO);
			expect(await mapZoom(page)).toBeCloseTo(dragged);
			await expect(chosenCard(page).getByRole('heading')).toHaveText(name);
		});

		test('a city tapped on the map whose card is out of view is chosen: the row brings the card whole to its nearer edge, the map goes to it', async ({
			page,
		}) => {
			await openTheCarousel(page);
			await expect(cityCard(page, 'Суботица')).not.toBeInViewport();
			expect(await fromTheMapMiddle(page, 'Суботица')).toBeGreaterThan(WENT_TO);

			await tapMap(page, placeOf('Суботица'));

			await expect(chosenCard(page).getByRole('heading')).toHaveText('Суботица');
			await expect.poll(() => wholeAt(page, 'Суботица')).toBe('right');
			expect(await fromTheMapMiddle(page, 'Суботица')).toBeLessThan(WENT_TO);
		});

		test('a city picked in the list of all is chosen at once: a card out of view comes whole to the nearer edge, one in view stays', async ({
			page,
		}) => {
			await openTheCarousel(page);

			await pickInTheList(page, 'Мостар');

			await expect(chosenCard(page).getByRole('heading')).toHaveText('Мостар');
			await expect.poll(() => wholeAt(page, 'Мостар')).toBe('right');
			expect(await fromTheMapMiddle(page, 'Мостар')).toBeLessThan(WENT_TO);

			await carousel(page).evaluate((element) => {
				element.scrollLeft = 0;
			});
			await pickInTheList(page, 'Будапешт');

			await expect(chosenCard(page).getByRole('heading')).toHaveText('Будапешт');
			await settle(page);
			expect(await scrolled(page)).toBe(0);
			expect(await fromTheMapMiddle(page, 'Будапешт')).toBeLessThan(WENT_TO);
		});

		test('Tab goes through the cards: the card in focus comes whole into view, its city not chosen', async ({ page }) => {
			await openTheCarousel(page);
			const center = await mapCenter(page);
			await cityCard(page, 'Будапешт').getByRole('button').focus();

			// A card's name, then its «Маршрут»: six cards on, Szeged, out of view.
			for (let press = 0; press < 12; press += 1) {
				await page.keyboard.press('Tab');
			}

			await expect(cityCard(page, 'Сегед').getByRole('button')).toBeFocused();
			await expect.poll(() => wholeAt(page, 'Сегед')).not.toBe('cut');
			await settle(page);
			await expect(chosenCard(page)).toHaveCount(0);
			expect((await labelsOnMap(page)).chosen).toEqual([]);
			expect(await mapCenter(page)).toEqual(center);
		});
	});
}

test.describe('a window that turns narrow', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test("puts the chosen city's card at the left edge at once, and the map stays", async ({ page }) => {
		await openTheCarousel(page);
		await pressCard(page, 'mouse', 'Ниш');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		await carousel(page).evaluate((element) => {
			element.scrollLeft = 0;
		});
		await settle(page);
		const center = await mapCenter(page);

		await page.setViewportSize({ width: 390, height: 844 });

		await expect.poll(async () => Math.round((await boxOf(cityCard(page, 'Ниш'))).x)).toBe(EDGE);
		await settle(page);
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		expect(await mapCenter(page)).toEqual(center);
	});

	test('with no city chosen, chooses none, and the map stays', async ({ page }) => {
		await openTheCarousel(page);
		await carousel(page).evaluate((element) => {
			element.scrollLeft = 600;
		});
		await settle(page);
		const center = await mapCenter(page);

		await narrowTo390(page);

		await settle(page);
		await expect(chosenCard(page)).toHaveCount(0);
		expect((await labelsOnMap(page)).chosen).toEqual([]);
		expect(await mapCenter(page)).toEqual(center);
	});

	test('with a city chosen that has no card, keeps it chosen, marks no card, and the map stays', async ({ page }) => {
		await openTheCarousel(page);
		// Reşiţa has no card: tapped on the map, it is chosen, and the list of all opens.
		await tapMap(page, placeOf('Решица'));
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await carousel(page).evaluate((element) => {
			element.scrollLeft = 600;
		});
		await settle(page);
		expect((await labelsOnMap(page)).chosen).toEqual(['Решица']);
		const center = await mapCenter(page);

		await narrowTo390(page);

		await settle(page);
		await expect(chosenCard(page)).toHaveCount(0);
		expect((await labelsOnMap(page)).chosen).toEqual(['Решица']);
		expect(await mapCenter(page)).toEqual(center);
	});
});

/**
 * Turns the window narrow, a phone's 390×844, and waits until the carousel has its narrow layout: a card at its left
 * edge, where it snaps.
 */
async function narrowTo390(page: Page): Promise<void> {
	await page.setViewportSize({ width: 390, height: 844 });
	await expect
		.poll(async () =>
			(await cityCards(page).evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().x)))).includes(EDGE),
		)
		.toBe(true);
}

/** An element's outline, or its pseudo-element's, as the browser computes it. */
async function outlineOf(element: Locator, pseudo?: '::after') {
	return element.evaluate((target, of) => {
		const style = getComputedStyle(target, of);
		return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset };
	}, pseudo ?? null);
}

/** The colour of a token of `:root`, as the browser computes a colour. */
async function tokenColor(page: Page, token: '--ring' | '--fg'): Promise<string> {
	return page.evaluate((name) => {
		const probe = document.createElement('i');
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const { color } = getComputedStyle(probe);
		probe.remove();
		return color;
	}, token);
}

// The desktop, the tablet and a phone: the chosen card's mark and the keyboard's focus look apart at any width.
for (const window of [...CHECKED, ...WINDOWS.filter(({ width, height }) => width === 390 && height === 844)]) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test("the keyboard's focus on a card is an outline of --fg 3 px out, the chosen card's mark one of --ring 2 px close", async ({
			page,
		}) => {
			await openTheCarousel(page);
			await cityCard(page, 'Будапешт').getByRole('button').focus();
			await page.keyboard.press('Enter');
			// On the phone the card is chosen by the stop of the carousel's smooth scroll to it, which the browser runs.
			await runUntil(
				page,
				async () => (await chosenCard(page).getByRole('heading').allInnerTexts()).join() === 'Будапешт',
				'Будапешт chosen',
			);
			await settle(page);

			await page.keyboard.press('Tab');
			await page.keyboard.press('Tab');
			await settle(page);

			const focused = cityCard(page, 'Сараево').getByRole('button');
			await expect(focused).toBeFocused();
			expect(await focused.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
			const [ring, fg] = await Promise.all([tokenColor(page, '--ring'), tokenColor(page, '--fg')]);
			// The tap's area, which covers its card, carries the focus's outline.
			expect(await outlineOf(focused, '::after')).toEqual({ style: 'solid', width: '2px', color: fg, offset: '3px' });
			expect(await outlineOf(chosenCard(page))).toEqual({ style: 'solid', width: '2px', color: ring, offset: '0px' });
		});
	});
}
