// The screen's two layouts (spec #20 «Экран», «Решения по тестам»; #96, #98, #113): the wide one on a window at least
// 720 × 500, the narrow one on the rest, whatever the pointer, on each window of the table (e2e/windows.ts); and a
// window that crosses the threshold, which changes the look at once and closes or resets nothing. Read by the
// elements' boxes, never by pixels.
import type { Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { expect, squareRing, test, visaRules } from './fixtures.ts';
import { expectRingCard, labelsOnMap, phrase, sheetPanel, sheetPlace, slider, tapMap } from './screen.ts';
import { onWindow, windowName, WINDOWS } from './windows.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const NIS = { lat: 43.325, lon: 21.903 };
/** Belgrade at 2–3 h: with every country around open, 16 cities of the fixtures in its band. */
const LINK = '/#/?p=44.81760,20.45730&h=3&cit=RUS';
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

test.beforeEach(async ({ page, ringApi }) => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN) }));
	await page.goto(LINK);
	await expectRingCard(page, '2–3 ч');
});

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

		const [look, place] =
			window.layout === 'wide' ? ['a modal in the middle', modalOn(window)] : ['a sheet at the bottom', sheetOn(window)];

		test(`«Гражданство» is ${look}`, async ({ page }) => {
			await phrase(page).getByRole('button', { name: 'РФ' }).click();

			expect(await sheetPlace(page, 'Гражданство')).toMatchObject(place);
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
