// The screen's two layouts (spec #20 «Экран», «Решения по тестам»; #96, #97, #98, #104, #113): the wide one on a
// window at least 720 × 500, the narrow one on the rest, whatever the pointer, on each window of the table
// (e2e/windows.ts); and a window that crosses the threshold, which changes the look at once and closes or resets
// nothing. On the wide screen the slider is a row at the bottom left, over the carousel's cards, and the carousel runs
// the whole width. Read by the elements' boxes, never by pixels.
import type { Locator, Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { CITIES, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import type { RingApi } from './ring-api.ts';
import {
	type Box,
	boxOf,
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
	sources,
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

/** Where the page's clock stands, held, while the screen opens: the data's sources stay in the phrase's plate. */
const START = Date.parse('2026-11-09T12:00:00Z');
/** Visa rules three days old: «визовые правила от 6 ноября» in the phrase's plate. */
const OLD_RULES = '2026-11-06T12:00:00Z';
/** The phrase's plate is at most this wide (#103). */
const WIDEST_PHRASE = 720;

/** Answers every ring with visa rules from Sherpa at `loadedAt`. */
const rulesFrom = (ringApi: RingApi, loadedAt: string): void => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN, loadedAt) }));
};

/** Opens `path` with the clock held 1 s after the load, and waits for its ring. */
async function openHeld(page: Page, path: string, ring = '11–12 ч'): Promise<void> {
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 1000);
	await open(page, path, ring);
}

/** The line in the phrase's plate that dates old visa rules, «визовые правила от <дата>». */
const rulesDate = (page: Page): Locator => phrase(page).getByTestId('rules-date');

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
		rulesFrom(ringApi, new Date(START).toISOString());
		await openHeld(page, '/#/?p=44.81760,20.45730&h=6&cit=RUS', '5–6 ч');
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
