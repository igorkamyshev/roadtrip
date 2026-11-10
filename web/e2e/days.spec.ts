// Days on the slider (#83; spec #20 «Экран», «Ползунок», «Состояние, ссылка и память браузера», with their
// amendments): after the hours 1–12, the days 2…MAX_DAYS, day D the ring 12·(D − 1) to 12·D h. The slider shows one
// unit at a time and folds the other into a tab, «дни ↑» over the hours' panel or «часы ↓» under the days'; it turns
// to the other unit only once that is committed. The link says `d=D` for a day.
import type { Locator, Page } from '@playwright/test';
import { allowGeolocation, expect, squareRing, test, visaRules } from './fixtures.ts';
import {
	boxOf,
	dottedHours,
	expectRingCard,
	firstCard,
	phrase,
	recordSliderHours,
	slider,
	sliderCells,
	sliderHour,
	sliderPanel,
	sliderTab,
} from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const AT_12_HOURS = '/#/?p=44.81760,20.45730&h=12&cit=RUS';

/** A ring per request: a band from its lower to its upper bound in tenths of a degree around the origin. */
const ringFor = (call: { lat: string; lon: string; from: number; hours: number }) =>
	squareRing(Number(call.lat), Number(call.lon), [call.from / 10, call.hours / 10]);

/** Whether the tab stands over the panel (true) or under it (false), apart from it. */
async function tabOverPanel(page: Page): Promise<boolean> {
	const [tab, panel] = await Promise.all([boxOf(sliderTab(page)), boxOf(sliderPanel(page))]);
	if (tab.y + tab.height <= panel.y) {
		return true;
	}
	if (tab.y >= panel.y + panel.height) {
		return false;
	}
	throw new Error('the tab is on the panel');
}

test.beforeEach(async ({ context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond(ringFor);
});

test('in hours the slider has twelve cells and «дни ↑» over them; a key up from 12 h asks for day 2, 12–24 h', async ({
	page,
	ringApi,
}) => {
	await page.goto(AT_12_HOURS);
	await expectRingCard(page, '11–12 ч');
	await expect(sliderCells(page)).toHaveCount(12);
	await expect(sliderTab(page)).toHaveText('дни ↑');
	expect(await tabOverPanel(page)).toBe(true);

	await slider(page).press('ArrowUp');

	await expectRingCard(page, '1–2 дня');
	// Days 2 to 5 (MAX_DAYS, docs/container-bench.md).
	await expect(sliderCells(page)).toHaveCount(4);
	await expect(sliderTab(page)).toHaveText('часы ↓');
	expect(await tabOverPanel(page)).toBe(false);
	expect(ringApi.calls.at(-1)).toMatchObject({ from: 12, hours: 24 });
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&d=2&cit=RUS$/u);
});

test('a key down from day 2 goes back to 12 h', async ({ page }) => {
	await page.goto('/#/?p=44.81760,20.45730&d=2&cit=RUS');
	await expectRingCard(page, '1–2 дня');

	await slider(page).press('ArrowDown');

	await expectRingCard(page, '11–12 ч');
	await expect(sliderCells(page)).toHaveCount(12);
});

test('a tap on «часы ↓» chooses 12 h, and a tap on «дни ↑» day 2', async ({ page, ringApi }) => {
	await page.goto('/#/?p=44.81760,20.45730&d=4&cit=RUS');
	await expectRingCard(page, '3–4 дня');

	await sliderTab(page).click();
	await expectRingCard(page, '11–12 ч');

	await sliderTab(page).click();
	await expectRingCard(page, '1–2 дня');
	expect(ringApi.calls.map((call) => [call.from, call.hours])).toEqual([
		[36, 48],
		[11, 12],
		[12, 24],
	]);
});

test('a drag from an hour onto «дни ↑» chooses day 2 when let go, and the column stays in hours until then', async ({ page, ringApi }) => {
	await page.goto(AT_12_HOURS);
	await expectRingCard(page, '11–12 ч');
	const [from, tab] = await Promise.all([boxOf(sliderHour(page, 10)), boxOf(sliderTab(page))]);

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	await page.mouse.move(tab.x + tab.width / 2, tab.y + tab.height / 2, { steps: 8 });

	// Held on the tab: day 2 is chosen on the screen, the column is still the hours', nothing is asked for.
	await expect(slider(page)).toHaveAttribute('aria-valuetext', '1–2 дня');
	await expect(sliderCells(page)).toHaveCount(12);
	expect(ringApi.calls).toHaveLength(1);

	await page.mouse.up();

	await expectRingCard(page, '1–2 дня');
	await expect(sliderCells(page)).toHaveCount(4);
	expect(ringApi.calls.map((call) => [call.from, call.hours])).toEqual([
		[11, 12],
		[12, 24],
	]);
});

test('a tap on the panel over the cell of 12 h, short of the tab, chooses 12 h', async ({ page, ringApi }) => {
	await page.goto('/#/?p=44.81760,20.45730&h=11&cit=RUS');
	await expectRingCard(page, '10–11 ч');
	const [panel, cell] = await Promise.all([boxOf(sliderPanel(page)), boxOf(sliderHour(page, 12))]);

	// The panel's padding over the top cell.
	await page.mouse.click(cell.x + cell.width / 2, (panel.y + cell.y) / 2);

	await expectRingCard(page, '11–12 ч');
	expect(ringApi.calls.at(-1)).toMatchObject({ from: 11, hours: 12 });
});

test('the tab is as wide as the panel, and a tap just past it, over the map, takes it too', async ({ page }) => {
	await page.goto(AT_12_HOURS);
	await expectRingCard(page, '11–12 ч');
	const [tab, panel] = await Promise.all([boxOf(sliderTab(page)), boxOf(sliderPanel(page))]);
	expect(tab.width).toBeCloseTo(panel.width, 0);

	await page.mouse.click(tab.x + tab.width / 2, tab.y - 6);

	await expectRingCard(page, '1–2 дня');
});

test('the chosen day reads as its span over «дня», the others as their day', async ({ page }) => {
	await page.goto('/#/?p=44.81760,20.45730&d=3&cit=RUS');
	await expectRingCard(page, '2–3 дня');

	await expect(sliderHour(page, 36)).toHaveText('2–3дня');
	await expect(sliderHour(page, 24)).toHaveText('2');
	await expect(sliderHour(page, 60)).toHaveText('5');
});

test('the link d=3 opens the ring of 2–3 days', async ({ page, ringApi }) => {
	ringApi.hold();
	await page.goto('/#/?p=44.81760,20.45730&d=3&cit=RUS');

	await expect(phrase(page)).toContainText('Из точки Белград, 2–3 дня в пути.');
	await expect(firstCard(page)).toHaveAttribute('data-state', 'calculating');
	await expect(firstCard(page)).toContainText('Кольцо 2–3 дня');
	// A band with cities around Belgrade, from 1° to 3°.
	const call = await ringApi.answer({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules() });

	expect(call).toMatchObject({ lat: '44.81760', lon: '20.45730', from: 24, hours: 36 });
	await expect(firstCard(page)).toHaveAttribute('data-state', 'ring');
	await expect(firstCard(page)).toContainText('В кольце 2–3 дня');
});

for (const [what, search] of [
	['both h and d', 'h=5&d=3'],
	['a day after the last, 5', 'd=6'],
	['day 1, which the hours are', 'd=1'],
]) {
	test(`a link with ${what} opens 1 h`, async ({ page, ringApi }) => {
		await page.goto(`/#/?p=44.81760,20.45730&${search}&cit=RUS`);

		await expectRingCard(page, 'до 1 ч');
		expect(ringApi.calls).toEqual([expect.objectContaining({ from: 0, hours: 1 })]);
	});
}

test('a day whose ring is in memory is marked, after going to the hours and back', async ({ page, ringApi }) => {
	await page.goto('/#/?p=44.81760,20.45730&d=3&cit=RUS');
	await expectRingCard(page, '2–3 дня');
	await slider(page).press('ArrowDown');
	await expectRingCard(page, '1–2 дня');
	await slider(page).press('ArrowDown');
	await expectRingCard(page, '11–12 ч');

	await slider(page).press('ArrowUp');

	await expectRingCard(page, '1–2 дня');
	expect(await dottedHours(page)).toEqual([24, 36]);
	expect(ringApi.calls).toHaveLength(3);
});

// On the wide screen the slider is a row over the carousel (#97): the hours 1…12 left to right with «дни →» right of
// them, the days with «← часы» left of them. The same state, keys and commit on letting go as the column's.
/**
 * Presses the mouse at the middle of `from`, moves it in steps to the middle of `onto`, and calls `meanwhile` before it
 * lets go.
 */
async function dragOnto(page: Page, { from, onto }: { from: Locator; onto: Locator }, meanwhile: () => Promise<void>): Promise<void> {
	const [start, end] = await Promise.all([boxOf(from), boxOf(onto)]);
	await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
	await page.mouse.down();
	await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
	await meanwhile();
	await page.mouse.up();
}

/** Whether the tab stands right of the cells (true) or left of them (false), apart from them on one line. */
async function tabRightOfCells(page: Page): Promise<boolean> {
	const [tab, panel] = await Promise.all([boxOf(sliderTab(page)), boxOf(sliderPanel(page))]);
	expect(tab.y).toBeCloseTo(panel.y, 0);
	if (tab.x >= panel.x + panel.width) {
		return true;
	}
	if (tab.x + tab.width <= panel.x) {
		return false;
	}
	throw new Error('the tab is on the cells');
}

test.describe('on the wide screen', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('in hours the row has twelve cells and «дни →» right of them; a key right from 12 h goes to day 2, with «← часы» left of its four', async ({
		page,
		ringApi,
	}) => {
		await page.goto(AT_12_HOURS);
		await expectRingCard(page, '11–12 ч');
		await expect(sliderCells(page)).toHaveCount(12);
		await expect(sliderTab(page)).toHaveText('дни →');
		expect(await tabRightOfCells(page)).toBe(true);

		await slider(page).press('ArrowRight');

		await expectRingCard(page, '1–2 дня');
		await expect(sliderCells(page)).toHaveCount(4);
		await expect(sliderTab(page)).toHaveText('← часы');
		expect(await tabRightOfCells(page)).toBe(false);
		expect(ringApi.calls.at(-1)).toMatchObject({ from: 12, hours: 24 });
	});

	test('a tap on «← часы» chooses 12 h, and a tap on «дни →» day 2', async ({ page, ringApi }) => {
		await page.goto('/#/?p=44.81760,20.45730&d=4&cit=RUS');
		await expectRingCard(page, '3–4 дня');
		await expect(sliderTab(page)).toHaveText('← часы');

		await sliderTab(page).click();
		await expectRingCard(page, '11–12 ч');
		await expect(sliderTab(page)).toHaveText('дни →');

		await sliderTab(page).click();
		await expectRingCard(page, '1–2 дня');
		expect(ringApi.calls.map((call) => [call.from, call.hours])).toEqual([
			[36, 48],
			[11, 12],
			[12, 24],
		]);
	});

	test('a drag along the row shows each hour under the pointer and asks for one ring when let go', async ({ page, ringApi }) => {
		await page.goto('/#/?p=44.81760,20.45730&h=3&cit=RUS');
		await expectRingCard(page, '2–3 ч');
		expect(await tabRightOfCells(page)).toBe(true);
		const shown = await recordSliderHours(page);

		await dragOnto(page, { from: sliderHour(page, 3), onto: sliderHour(page, 9) }, async () => {
			await expect(slider(page)).toHaveAttribute('aria-valuetext', '8–9 ч');
			expect(ringApi.calls).toHaveLength(1);
		});

		await expectRingCard(page, '8–9 ч');
		expect(await shown()).toEqual([4, 5, 6, 7, 8, 9]);
		expect(ringApi.calls.map((call) => call.hours)).toEqual([3, 9]);
	});

	test('a drag from an hour past the row’s end onto «дни →» chooses day 2 when let go, and the row stays in hours until then', async ({
		page,
		ringApi,
	}) => {
		await page.goto(AT_12_HOURS);
		await expectRingCard(page, '11–12 ч');
		expect(await tabRightOfCells(page)).toBe(true);

		await dragOnto(page, { from: sliderHour(page, 10), onto: sliderTab(page) }, async () => {
			await expect(slider(page)).toHaveAttribute('aria-valuetext', '1–2 дня');
			await expect(sliderCells(page)).toHaveCount(12);
			expect(ringApi.calls).toHaveLength(1);
		});

		await expectRingCard(page, '1–2 дня');
		await expect(sliderCells(page)).toHaveCount(4);
		expect(ringApi.calls.map((call) => [call.from, call.hours])).toEqual([
			[11, 12],
			[12, 24],
		]);
	});

	test('a drag from a day past the row’s start onto «← часы» chooses 12 h when let go, and the row stays in days until then', async ({
		page,
		ringApi,
	}) => {
		await page.goto('/#/?p=44.81760,20.45730&d=3&cit=RUS');
		await expectRingCard(page, '2–3 дня');
		expect(await tabRightOfCells(page)).toBe(false);

		await dragOnto(page, { from: sliderHour(page, 36), onto: sliderTab(page) }, async () => {
			await expect(slider(page)).toHaveAttribute('aria-valuetext', '11–12 ч');
			await expect(sliderCells(page)).toHaveCount(4);
			expect(ringApi.calls).toHaveLength(1);
		});

		await expectRingCard(page, '11–12 ч');
		await expect(sliderCells(page)).toHaveCount(12);
		expect(ringApi.calls.map((call) => [call.from, call.hours])).toEqual([
			[24, 36],
			[11, 12],
		]);
	});
});
