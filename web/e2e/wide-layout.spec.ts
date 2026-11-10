// The screen's two layouts (spec #20 «Экран», «Решения по тестам»; #96, #97, #98, #104, #113): the wide one on a
// window at least 720 × 500, the narrow one on the rest, whatever the pointer, on each window of the table
// (e2e/windows.ts); and a window that crosses the threshold, which changes the look at once and closes or resets
// nothing. On the wide screen the slider is a row at the bottom left, over the carousel's cards, and the carousel runs
// the whole width; the first card stands where it does with a ring in every state (#106); the phrase is one plate at
// the top left, with the date of old visa rules and the first 5 s' data's sources in it (#103). Read by the elements'
// boxes, never by pixels.
import type { Page } from '@playwright/test';
import {
	BELGRADE,
	CITIES,
	expect,
	LINK_3_HOURS_RUS,
	LONGEST,
	LONGEST_IN_DAYS,
	NIS,
	OLD_RULES,
	OPEN_AROUND_SERBIA,
	serveCities,
	SHORTEST,
	SHORTEST_IN_DAYS,
	squareRing,
	test,
	visaRules,
} from './fixtures.ts';
import type { RingApi } from './ring-api.ts';
import {
	BETWEEN,
	type Box,
	boxOf,
	cardsInView,
	carousel,
	carouselArrows,
	CLOCK_START,
	EDGE,
	expectApart,
	expectRingCard,
	firstCard,
	FROM_BELGRADE,
	fromEdges,
	labelsOnMap,
	MODAL_WIDTH,
	moreCard,
	openHeld,
	phrase,
	rulesDate,
	sheetPanel,
	sheetPlace,
	slider,
	sliderCells,
	sliderPanel,
	sliderTab,
	sources,
	startPinning,
	tapMap,
} from './screen.ts';
import { onWindow, WIDE_WINDOWS, windowName, WINDOWS } from './windows.ts';

/** The slider's row of cells on the wide screen, in hours and in days, and its cells' height (#97). */
const SLIDER_ROW = 560;
const SLIDER_CELL_HEIGHT = 40;

/**
 * The wide windows where the slider's row has its whole 560 px. At the threshold's corner, 720 × 500, it narrows for
 * the carousel's arrows (#99), whose ticket checks it there.
 */
const ROW_WINDOWS = WIDE_WINDOWS.filter((window) => window.width > 720);

test.beforeEach(({ ringApi }) => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN_AROUND_SERBIA) }));
});

/** Opens `path` and waits for its ring. */
async function open(page: Page, path = LINK_3_HOURS_RUS, ring = '2–3 ч'): Promise<void> {
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
			['hours', 'the longest phrase', LONGEST, '7–8 ч'],
			['hours', 'the shortest phrase', SHORTEST, '7–8 ч'],
			['days', 'the longest phrase', LONGEST_IN_DAYS, '6–7 дней'],
			['days', 'the shortest phrase', SHORTEST_IN_DAYS, '6–7 дней'],
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

/** The carousel's arrows' buttons (#99): 40 × 40, in a plate as high as the slider's row. */
const ARROW = 40;

for (const window of ROW_WINDOWS.filter(({ pointer }) => pointer === 'mouse')) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		for (const [unit, path, ring] of [
			['hours', LONGEST, '7–8 ч'],
			['days', LONGEST_IN_DAYS, '6–7 дней'],
		] as const) {
			test(`in ${unit}, the carousel's arrows stand in the slider's row 12 px from the right, level with it and at least 8 px from it, and the row keeps its 560 px`, async ({
				page,
			}) => {
				await open(page, path, ring);

				const [plate, row, panel, ...buttons] = await Promise.all(
					[carouselArrows(page), slider(page), sliderPanel(page), ...(await carouselArrows(page).getByRole('button').all())].map(
						async (element) => boxOf(element),
					),
				);
				expect(fromEdges(page, plate).right).toBeCloseTo(EDGE, 0);
				expect(plate.y).toBeCloseTo(row.y, 0);
				expect(plate.height).toBeCloseTo(row.height, 0);
				expect(plate.x - (row.x + row.width)).toBeGreaterThanOrEqual(BETWEEN);
				expect(panel.width).toBeCloseTo(SLIDER_ROW, 0);
				expect(buttons.map(({ width, height }) => [Math.round(width), Math.round(height)])).toEqual([
					[ARROW, ARROW],
					[ARROW, ARROW],
				]);
				await expectApart(page, {
					phrase: phrase(page),
					'slider row': slider(page),
					arrows: carouselArrows(page),
					...(await cardsInView(page)),
				});
			});
		}
	});
}

test.describe('on 720×500, mouse', () => {
	test.use(onWindow({ width: 720, height: 500, pointer: 'mouse', layout: 'wide' }));

	// The row about 500 px, an hour's cell about 59 px, a day's about 80 px (#97, #140: 8 hours, 6 days).
	for (const [unit, path, ring, cellWidth] of [
		['hours', LONGEST, '7–8 ч', 59],
		['days', LONGEST_IN_DAYS, '6–7 дней', 80],
	] as const) {
		test(`in ${unit}, the slider's row narrows to about 500 px for the carousel's arrows, at least 8 px from them, apart and on the screen`, async ({
			page,
		}) => {
			await open(page, path, ring);

			const [plate, row, panel, cell] = await Promise.all(
				[carouselArrows(page), slider(page), sliderPanel(page), sliderCells(page).first()].map(async (element) => boxOf(element)),
			);
			expect(fromEdges(page, plate).right).toBeCloseTo(EDGE, 0);
			expect(plate.y).toBeCloseTo(row.y, 0);
			expect(plate.x - (row.x + row.width)).toBeGreaterThanOrEqual(BETWEEN - 0.5);
			expect(panel.width).toBeLessThan(SLIDER_ROW);
			expect(Math.abs(panel.width / 500 - 1), `a row of ${panel.width} px`).toBeLessThanOrEqual(0.05);
			expect(Math.abs(cell.width / cellWidth - 1), `a cell of ${cell.width} px`).toBeLessThanOrEqual(0.05);
			await expectApart(page, {
				phrase: phrase(page),
				'slider row': slider(page),
				arrows: carouselArrows(page),
				...(await cardsInView(page)),
			});
		});
	}
});

// A step under the threshold in width and in height, with a mouse: the narrow screen with the arrows.
for (const window of WINDOWS.filter(({ layout, pointer }) => layout === 'narrow' && pointer === 'mouse')) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test("with the longest phrase, the carousel's arrows stand over the cards 12 px from the left, 8 px over them, apart from the phrase, the slider and the card at the left edge", async ({
			page,
		}) => {
			await open(page, LONGEST, '7–8 ч');

			const [plate, card] = await Promise.all([boxOf(carouselArrows(page)), boxOf(firstCard(page))]);
			expect(fromEdges(page, plate).left).toBeCloseTo(EDGE, 0);
			expect(card.y - (plate.y + plate.height)).toBeCloseTo(BETWEEN, 0);
			await expectApart(page, {
				phrase: phrase(page),
				slider: slider(page),
				arrows: carouselArrows(page),
				'card at the left edge': firstCard(page),
			});
		});
	});
}

for (const window of WINDOWS.filter(({ pointer }) => pointer === 'touch')) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('without a mouse the carousel has no arrows, though its cards scroll', async ({ page }) => {
			await open(page);
			await expect(page.getByTestId('city-card')).toHaveCount(12);

			expect(await carousel(page).evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
			await expect(carouselArrows(page)).toHaveCount(0);
		});
	});
}

/** Where the first card stands, to the pixel: how far from the left and the bottom edges, and how wide. */
async function firstCardPlace(page: Page): Promise<{ left: number; bottom: number; width: number }> {
	const box = await boxOf(firstCard(page));
	const { left, bottom } = fromEdges(page, box);
	return { left: Math.round(left), bottom: Math.round(bottom), width: Math.round(box.width) };
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

			await page.goto(LINK_3_HOURS_RUS);
			await expect(firstCard(page)).toHaveAttribute('data-state', 'calculating');
			const calculating = await firstCardPlace(page);
			await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), 'first card': firstCard(page) });

			await ringApi.answer({ status: 502 });
			await expect(firstCard(page)).toHaveAttribute('data-state', 'error');
			const failure = await firstCardPlace(page);
			await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), 'first card': firstCard(page) });

			ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN_AROUND_SERBIA) }));
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
			await open(page, LONGEST, '7–8 ч');
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
			await open(page, LONGEST, '7–8 ч');
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

/** The phrase's plate is at most this wide (#103). */
const WIDEST_PHRASE = 720;

/** Answers every ring with visa rules from Sherpa at `loadedAt`. */
const rulesFrom = (ringApi: RingApi, loadedAt: string): void => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN_AROUND_SERBIA, loadedAt) }));
};

/** Whether `inner` lies wholly in `outer`. */
const within = (inner: Box, outer: Box): boolean =>
	inner.x >= outer.x &&
	inner.y >= outer.y &&
	inner.x + inner.width <= outer.x + outer.width &&
	inner.y + inner.height <= outer.y + outer.height;

/**
 * Where the phrase breaks its lines badly, read from its text's boxes: a comma on another line than the word in brackets
 * before it, and «мои визы:» on two lines (or not in the phrase). Empty when it breaks well.
 */
async function badBreaks(page: Page): Promise<string[]> {
	return phrase(page).evaluate((plate) => {
		// A stretch of text, whose boxes are one a line.
		const range = document.createRange();
		const bad: string[] = [];
		for (const word of Array.from(plate.querySelectorAll('button'))) {
			const after = word.nextSibling;
			if (after?.nodeType === Node.TEXT_NODE && after.textContent?.startsWith(',') === true) {
				range.setStart(after, 0);
				range.setEnd(after, 1);
				const last = Array.from(word.getClientRects()).at(-1);
				const comma = Array.from(range.getClientRects()).at(0);
				if (last === undefined || comma === undefined || comma.top >= last.bottom || comma.bottom <= last.top) {
					bad.push(`«${word.textContent}» and its comma`);
				}
			}
		}
		const walker = document.createTreeWalker(plate, NodeFilter.SHOW_TEXT);
		let visasLines = 0;
		for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
			const found = /мои\s+визы:/u.exec(text.textContent ?? '');
			if (found !== null) {
				range.setStart(text, found.index);
				range.setEnd(text, found.index + found[0].length);
				visasLines = new Set(Array.from(range.getClientRects()).map((box) => Math.round(box.bottom))).size;
			}
		}
		if (visasLines !== 1) {
			bad.push('«мои визы:»');
		}
		return bad;
	});
}

for (const window of WIDE_WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test.beforeEach(({ ringApi }) => {
			rulesFrom(ringApi, OLD_RULES);
		});

		for (const [phraseOf, path] of [
			['the longest phrase', LONGEST],
			['the shortest phrase', SHORTEST],
		] as const) {
			test(`with ${phraseOf}, the phrase is one plate 12 px from the top and the left, no wider than 720 px and the window less 24, with the visa rules' date and for 5 s the data's sources in it, apart from the slider's row and the cards`, async ({
				page,
			}) => {
				await openHeld(page, path);
				await expect(sources(page)).toBeVisible();

				const [plate, date, links] = await Promise.all([boxOf(phrase(page)), boxOf(rulesDate(page)), boxOf(sources(page))]);
				expect(fromEdges(page, plate).top).toBeCloseTo(EDGE, 0);
				expect(fromEdges(page, plate).left).toBeCloseTo(EDGE, 0);
				expect(plate.width).toBeLessThanOrEqual(Math.min(WIDEST_PHRASE, window.width - 2 * EDGE));
				expect(within(date, plate), 'the date in the plate').toBe(true);
				expect(within(links, plate), 'the sources in the plate').toBe(true);
				expect(links.y, 'the sources under the date').toBeGreaterThanOrEqual(date.y + date.height);
				await expectApart(page, { phrase: phrase(page), 'slider row': slider(page), ...(await cardsInView(page)) });
			});
		}

		test('after 5 s the sources leave the plate: it gets lower, keeps its top, left and width, and the slider and the cards stay', async ({
			page,
		}) => {
			await openHeld(page, LONGEST);
			await expect(sources(page)).toBeVisible();
			const [plate, row, card] = await Promise.all([boxOf(phrase(page)), boxOf(slider(page)), boxOf(firstCard(page))]);

			await page.clock.runFor(5000);

			await expect(sources(page)).toHaveCount(0);
			await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toHaveCount(0);
			const after = await boxOf(phrase(page));
			expect(after.height).toBeLessThan(plate.height);
			expect(after).toMatchObject({ x: plate.x, y: plate.y, width: plate.width });
			expect(await boxOf(slider(page))).toEqual(row);
			expect(await boxOf(firstCard(page))).toEqual(card);
		});

		test('the longest phrase keeps each comma on the line of the word before it, and «мои визы:» on one line', async ({ page }) => {
			await openHeld(page, LONGEST);

			expect(await badBreaks(page)).toEqual([]);
		});
	});
}

test.describe('on 768×1024, touch', () => {
	test.use(onWindow({ width: 768, height: 1024, pointer: 'touch', layout: 'wide' }));

	test('the short phrase «Из точки Белград, 5–6 часов в пути. Гражданство РФ, мои визы: нет ⓘ» is one line', async ({ page, ringApi }) => {
		rulesFrom(ringApi, new Date(CLOCK_START).toISOString());
		await openHeld(page, `${FROM_BELGRADE}&h=6&cit=RUS`, '5–6 ч');
		await expect(phrase(page)).toContainText('Из точки Белград, 5–6 часов в пути. Гражданство РФ, мои визы: нет');

		const [first, last] = await Promise.all([
			boxOf(phrase(page).getByRole('button', { name: 'Белград' })),
			boxOf(phrase(page).getByRole('button', { name: 'Что важно знать' })),
		]);
		expect(first.y < last.y + last.height && last.y < first.y + first.height, '«Белград» and ⓘ on one line').toBe(true);
	});
});

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
