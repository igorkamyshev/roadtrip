// The screen's two layouts (spec #20 «Экран», «Решения по тестам»; #96, #97, #98, #104, #113): the wide one on a
// window at least 720 × 500, the narrow one on the rest, whatever the pointer, on each window of the table
// (e2e/windows.ts); and a window that crosses the threshold, which changes the look at once and closes or resets
// nothing. On the wide screen the slider is a row at the bottom left, over the carousel's cards, and the carousel runs
// the whole width; the first card stands where it does with a ring in every state (#106). Read by the elements'
// boxes, never by pixels.
import type { Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { CITIES, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import {
	boxOf,
	type Box,
	cardsInView,
	carousel,
	expectApart,
	expectRingCard,
	firstCard,
	fromEdges,
	labelsOnMap,
	moreCard,
	phrase,
	sheetPanel,
	sheetPlace,
	slider,
	sliderCells,
	sliderPanel,
	sliderTab,
	tapMap,
} from './screen.ts';
import { onWindow, WIDE_WINDOWS, windowName, WINDOWS } from './windows.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const NIS = { lat: 43.325, lon: 21.903 };
/** Belgrade at 2–3 h: with every country around open, 16 cities of the fixtures in its band. */
const LINK = '/#/?p=44.81760,20.45730&h=3&cit=RUS';
/** Belgrade at 12 h and at 4–5 days, with four citizenships and four visas, or one citizenship and no visas. */
const LONGEST = '/#/?p=44.81760,20.45730&h=12&cit=BIH,MNE,RUS,SRB&visas=CAN,GBR,SCHENGEN,USA';
const SHORTEST = '/#/?p=44.81760,20.45730&h=12&cit=RUS';
const LONGEST_IN_DAYS = '/#/?p=44.81760,20.45730&d=5&cit=BIH,MNE,RUS,SRB&visas=CAN,GBR,SCHENGEN,USA';
const SHORTEST_IN_DAYS = '/#/?p=44.81760,20.45730&d=5&cit=RUS';
const OPEN: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'visa_free', citizenship: 'RUS' },
	ROU: { mode: 'visa_free', citizenship: 'RUS' },
	HRV: { mode: 'visa_free', citizenship: 'RUS' },
};

/** A modal is this wide, in the middle of the window (#98). */
const MODAL_WIDTH = 480;
/** Every floating panel stands this far from the screen's edges (#85); a modal's top no closer. */
const EDGE = 12;
/** The gap between neighbouring panels (#85): the slider's row over the carousel's cards. */
const BETWEEN = 8;
/** The slider's row of cells on the wide screen, in hours and in days, and its cells' height (#97). */
const SLIDER_ROW = 560;
const SLIDER_CELL_HEIGHT = 40;

/**
 * The wide windows where the slider's row has its whole 560 px. At the threshold's corner, 720 × 500, it narrows for
 * the carousel's arrows (#99), whose ticket checks it there.
 */
const ROW_WINDOWS = WIDE_WINDOWS.filter((window) => window.width > 720);

test.beforeEach(({ ringApi }) => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN) }));
});

/** Opens `path` and waits for its ring. */
async function open(page: Page, path = LINK, ring = '2–3 ч'): Promise<void> {
	await page.goto(path);
	await expectRingCard(page, ring);
}

/** Where the wide layout's modal stands on a window of this size: 480 px in the middle, its top 10 % down. */
const modalOn = ({ width, height }: { width: number; height: number }) => ({
	width: MODAL_WIDTH,
	middle: Math.round(width / 2),
	top: Math.round(Math.max(height / 10, EDGE)),
});

/** Where the narrow layout's sheet stands on a window of this size: the whole width, down to the bottom. */
const sheetOn = ({ width, height }: { width: number; height: number }) => ({ left: 0, width, bottom: height });

for (const window of WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		const wide = window.layout === 'wide';
		const [look, place] = wide ? ['a modal in the middle', modalOn(window)] : ['a sheet at the bottom', sheetOn(window)];

		test(`«Гражданство» is ${look}`, async ({ page }) => {
			await open(page);
			await phrase(page).getByRole('button', { name: 'РФ' }).click();

			expect(await sheetPlace(page, 'Гражданство')).toMatchObject(place);
		});

		test(`the slider is ${wide ? 'a row, horizontal' : 'a column, vertical'} to a screen reader too`, async ({ page }) => {
			await open(page);

			const box = await boxOf(slider(page));
			expect(box.width > box.height).toBe(wide);
			await expect(slider(page)).toHaveAttribute('aria-orientation', wide ? 'horizontal' : 'vertical');
		});
	});
}

for (const window of ROW_WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		for (const [unit, phraseOf, path, ring] of [
			['hours', 'the longest phrase', LONGEST, '11–12 ч'],
			['hours', 'the shortest phrase', SHORTEST, '11–12 ч'],
			['days', 'the longest phrase', LONGEST_IN_DAYS, '4–5 дней'],
			['days', 'the shortest phrase', SHORTEST_IN_DAYS, '4–5 дней'],
		] as const) {
			/** The tab and the cells as they stand from left to right: «дни →» right of the hours, «← часы» left of the days. */
			const leftToRight = <T>(tab: T, cells: T): [T, T] => (unit === 'days' ? [tab, cells] : [cells, tab]);

			test(`in ${unit}, with ${phraseOf}, the slider is a row of 560 px 12 px from the left, 8 px over the cards and apart from them and the phrase`, async ({
				page,
			}) => {
				await open(page, path, ring);

				const [row, panel, tab, cell, card] = await Promise.all(
					[slider(page), sliderPanel(page), sliderTab(page), sliderCells(page).first(), firstCard(page)].map(async (element) =>
						boxOf(element),
					),
				);
				expect(row.width).toBeGreaterThan(row.height);
				expect(panel.width).toBeCloseTo(SLIDER_ROW, 0);
				expect(cell.height).toBeCloseTo(SLIDER_CELL_HEIGHT, 0);
				expect(tab.height).toBeCloseTo(panel.height, 0);
				expect(fromEdges(page, row).left).toBeCloseTo(EDGE, 0);
				expect(card.y - (row.y + row.height)).toBeCloseTo(BETWEEN, 0);
				const [left, right] = leftToRight(tab, panel);
				expect(left.x + left.width).toBeLessThanOrEqual(right.x);
				await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), ...(await cardsInView(page)) });
			});
		}

		test('the carousel runs the whole width, its first card 12 px from the left, and ends with «и ещё K» 12 px from the right', async ({
			page,
		}) => {
			await open(page);
			const [row, card] = await Promise.all([boxOf(carousel(page)), boxOf(firstCard(page))]);
			expect(row).toMatchObject({ x: 0, width: window.width });
			expect(card.x).toBeCloseTo(EDGE, 0);

			await carousel(page).evaluate((element) => {
				element.scrollLeft = element.scrollWidth;
			});

			await expect.poll(async () => Math.round(fromEdges(page, await boxOf(moreCard(page))).right)).toBe(EDGE);
		});

		test('with one city the row stands from the left edge and does not scroll', async ({ page }) => {
			await serveCities(
				page,
				CITIES.filter(([, name]) => name === 'Будапешт'),
			);
			await open(page);
			await expect(page.getByTestId('city-card')).toHaveCount(1);

			expect(fromEdges(page, await boxOf(firstCard(page))).left).toBeCloseTo(EDGE, 0);
			expect(await carousel(page).evaluate((element) => element.scrollWidth - element.clientWidth)).toBe(0);
		});
	});
}

/** Where the first card stands, to the pixel: how far from the left and the bottom edges, and how wide. */
async function firstCardPlace(page: Page): Promise<{ left: number; bottom: number; width: number }> {
	const box = await boxOf(firstCard(page));
	const { left, bottom } = fromEdges(page, box);
	return { left: Math.round(left), bottom: Math.round(bottom), width: Math.round(box.width) };
}

/** Turns the pin mode on from the phrase, «Откуда едем» and «Указать на карте». */
async function startPinning(page: Page): Promise<void> {
	await phrase(page).getByRole('button', { name: 'Белград' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
}

/** The boxes of the pin's panel, its hint and its buttons. */
async function pinPanel(page: Page): Promise<{ panel: Box; hint: Box; cancel: Box; start: Box }> {
	const panel = page.getByTestId('pin-bar');
	const [box, hint, cancel, start] = await Promise.all(
		[
			panel,
			panel.getByText(/^Двигайте карту/u),
			panel.getByRole('button', { name: 'Отмена' }),
			panel.getByRole('button', { name: 'Старт здесь' }),
		].map(async (element) => boxOf(element)),
	);
	return { panel: box, hint, cancel, start };
}

for (const window of WIDE_WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('the first card stands where it does with a ring, as wide, in «Откуда едем?», while calculating and on a failure, apart from the phrase and the slider', async ({
			page,
			ringApi,
		}) => {
			ringApi.hold();
			await page.goto('/');
			await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');
			await expect(slider(page)).toHaveCount(0);
			const noOrigin = await firstCardPlace(page);
			await expectApart(page, { phrase: phrase(page), 'first card': firstCard(page) });

			await page.goto(LINK);
			await expect(firstCard(page)).toHaveAttribute('data-state', 'calculating');
			const calculating = await firstCardPlace(page);
			await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), 'first card': firstCard(page) });

			await ringApi.answer({ status: 502 });
			await expect(firstCard(page)).toHaveAttribute('data-state', 'error');
			const failure = await firstCardPlace(page);
			await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), 'first card': firstCard(page) });

			ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN) }));
			await firstCard(page).getByRole('button', { name: 'Повторить' }).click();
			await expectRingCard(page, '2–3 ч');
			const withRing = await firstCardPlace(page);

			expect(withRing).toMatchObject({ left: EDGE, bottom: EDGE });
			expect({ noOrigin, calculating, failure }).toEqual({ noOrigin: withRing, calculating: withRing, failure: withRing });
		});

		// At the threshold's corner the mouse's hint, «Отмена» and «Старт здесь» are wider than the window: the buttons
		// go under the hint. Everywhere wider they fit in its line (#107).
		const underTheHint = window.width === 720;

		test(`in the pin mode, with the longest phrase, the pin's panel stands 12 px from the left and the bottom, apart from the phrase, the buttons ${underTheHint ? 'under the hint' : 'in its line'}`, async ({
			page,
		}) => {
			await open(page, LONGEST, '11–12 ч');
			await startPinning(page);

			await expectApart(page, { phrase: phrase(page), 'pin panel': page.getByTestId('pin-bar') });
			const { panel, hint, cancel, start } = await pinPanel(page);
			const edges = fromEdges(page, panel);
			expect(edges.left).toBeCloseTo(EDGE, 0);
			expect(edges.bottom).toBeCloseTo(EDGE, 0);
			expect(edges.right).toBeGreaterThanOrEqual(EDGE - 0.5);
			expect(cancel.x + cancel.width).toBeLessThanOrEqual(start.x);
			expect(cancel.y >= hint.y + hint.height, 'the buttons under the hint').toBe(underTheHint);
		});
	});
}

for (const window of WIDE_WINDOWS.filter(({ width }) => width > 720)) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test("in the pin mode the pin's panel is one line with its padding round it, as wide as the hint and right after it the buttons", async ({
			page,
		}) => {
			await open(page, LONGEST, '11–12 ч');
			await startPinning(page);

			const { panel, hint, cancel, start } = await pinPanel(page);
			const padding = cancel.y - panel.y;
			expect(cancel.x).toBeGreaterThanOrEqual(hint.x + hint.width);
			expect(hint.y + hint.height / 2).toBeCloseTo(cancel.y + cancel.height / 2, 0);
			expect(panel.y + panel.height - (cancel.y + cancel.height)).toBeCloseTo(padding, 0);
			expect(hint.x - panel.x).toBeCloseTo(padding, 0);
			expect(panel.x + panel.width - (start.x + start.width)).toBeCloseTo(padding, 0);
		});
	});
}

/** What the person has done on the screen and in «Гражданство», which a new look must keep. */
async function whatTheyDid(page: Page) {
	const body = sheetPanel(page, 'Гражданство').getByTestId('sheet-body');
	return {
		filter: await sheetPanel(page, 'Гражданство').getByRole('searchbox', { name: 'Найти гражданство' }).inputValue(),
		scrolled: await body.evaluate((element) => element.scrollTop),
		focused: await page.evaluate(() => document.activeElement?.textContent),
		chosen: (await labelsOnMap(page)).chosen,
		hours: await slider(page).getAttribute('aria-valuenow'),
	};
}

test.describe('a window that crosses the threshold', () => {
	const WIDE = { width: 1440, height: 900 };
	const NARROW = { width: 390, height: 844 };
	test.use({ viewport: WIDE });

	test('changes «Гражданство» from a modal to a sheet and back, and keeps its filter, scroll and focus, the city and the cell', async ({
		page,
	}) => {
		await open(page);
		await tapMap(page, NIS);
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Ниш']);
		await phrase(page).getByRole('button', { name: 'РФ' }).click();
		const sheet = sheetPanel(page, 'Гражданство');
		await sheet.getByRole('searchbox', { name: 'Найти гражданство' }).fill('ан');
		await sheet.getByTestId('sheet-body').evaluate((element) => {
			element.scrollTop = 200;
		});
		await sheet.getByTestId('pick-item').nth(6).focus();
		const did = await whatTheyDid(page);
		expect(did).toMatchObject({ filter: 'ан', chosen: ['Ниш'], hours: '3' });
		expect(did.scrolled).toBeGreaterThan(0);
		expect(await sheetPlace(page, 'Гражданство')).toMatchObject(modalOn(WIDE));

		await page.setViewportSize(NARROW);

		expect(await sheetPlace(page, 'Гражданство')).toMatchObject(sheetOn(NARROW));
		expect(await whatTheyDid(page)).toEqual(did);

		await page.setViewportSize(WIDE);

		expect(await sheetPlace(page, 'Гражданство')).toMatchObject(modalOn(WIDE));
		expect(await whatTheyDid(page)).toEqual(did);
	});
});
