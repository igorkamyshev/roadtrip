// The sheets as modals on the wide screen (spec #20 «Экран», «Решения по тестам»; #98): «Гражданство», «Мои визы»,
// «Откуда едем», «Что важно знать» and the list of all cities, each 480 px in the middle of the window, its top 10 %
// down and no higher than 12 px, all in the window. «Гражданство», «Мои визы» and the list of all keep one height
// whatever the filter, 640 px or down to 12 px over the bottom; «Откуда едем» and «Что важно знать» are as high as
// what they hold, and grow down. The scrim, Esc and «Закрыть» close each. Read by the boxes, never by pixels.
import type { Locator, Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { expect, squareRing, test, visaRules } from './fixtures.ts';
import { boxOf, expectRingCard, phrase, sheetPanel, sheetPlace } from './screen.ts';
import { onWindow, WIDE_WINDOWS, windowName } from './windows.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=3&cit=RUS';

/** Every country around Serbia open: the band of 2–3 h holds 16 cities of the fixtures, 12 cards and «и ещё 4». */
const OPEN: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'visa_free', citizenship: 'RUS' },
	ROU: { mode: 'visa_free', citizenship: 'RUS' },
	HRV: { mode: 'visa_free', citizenship: 'RUS' },
};

/** A modal is this wide (#98). */
const MODAL_WIDTH = 480;
/** The modals with a filter, and the list of all, are this high, where the window has room (#98). */
const MODAL_HEIGHT = 640;
/** Every floating panel stands this far from the screen's edges (#85): a modal's top and bottom no closer. */
const EDGE = 12;

const MODAL_NAMES = ['Гражданство', 'Мои визы', 'Откуда едем', 'Что важно знать', 'Все города'] as const;
type ModalName = (typeof MODAL_NAMES)[number];

/** How each modal opens: by its word of the phrase, or by «и ещё» at the carousel's end. */
const MODALS: Record<ModalName, (page: Page) => Locator> = {
	Гражданство: (page) => phrase(page).getByRole('button', { name: 'РФ' }),
	'Мои визы': (page) => phrase(page).getByRole('button', { name: 'нет' }),
	'Откуда едем': (page) => phrase(page).getByRole('button', { name: 'Белград' }),
	'Что важно знать': (page) => phrase(page).getByRole('button', { name: 'Что важно знать' }),
	'Все города': (page) => page.getByRole('button', { name: /и ещё/u }),
};

/** The list of all is titled by the ring: «16 городов в кольце 2–3 ч». */
const title = (name: ModalName): string | RegExp => (name === 'Все города' ? /в кольце/u : name);

async function open(page: Page, name: ModalName): Promise<void> {
	await MODALS[name](page).click();
	await expect(sheetPanel(page, title(name))).toBeVisible();
}

/**
 * How far, in pixels, the modal ends from where it would if it showed all it holds (its body's top and the whole of
 * the body), or from 12 px over the bottom, whichever is higher. The body's whole height is in whole pixels, so 1 px
 * is as close as it reads.
 */
async function fromItsEnd(page: Page, name: ModalName, windowHeight: number): Promise<number> {
	const panel = sheetPanel(page, title(name));
	const body = panel.getByTestId('sheet-body');
	const [panelBox, bodyBox, bodyHeight] = await Promise.all([boxOf(panel), boxOf(body), body.evaluate((element) => element.scrollHeight)]);
	return Math.abs(panelBox.y + panelBox.height - Math.min(bodyBox.y + bodyHeight, windowHeight - EDGE));
}

test.beforeEach(async ({ page, ringApi }) => {
	ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(OPEN) }));
	await page.goto(LINK);
	await expectRingCard(page, '2–3 ч');
});

for (const window of WIDE_WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		/** Where a modal's top stands: 10 % down the window, and no higher than 12 px. */
		const top = Math.round(Math.max(window.height / 10, EDGE));
		/** How high a modal of a filter or the list of all is: 640 px, or down to 12 px over the bottom. */
		const height = Math.round(Math.min(MODAL_HEIGHT, window.height - EDGE - Math.max(window.height / 10, EDGE)));

		for (const name of MODAL_NAMES) {
			test(`«${name}» is 480 px in the middle, its top 10 % down, in the window`, async ({ page }) => {
				await open(page, name);

				const place = await sheetPlace(page, title(name));
				expect(place).toMatchObject({ width: MODAL_WIDTH, middle: Math.round(window.width / 2), top });
				expect(place.bottom).toBeLessThanOrEqual(window.height - EDGE);
			});
		}

		for (const [name, filter, narrow] of [
			['Гражданство', 'Найти гражданство', 'Серб'],
			['Мои визы', 'Найти страну', 'Серб'],
		] as const) {
			test(`«${name}» is 640 px high or down to 12 px over the bottom, with no filter and a narrow one`, async ({ page }) => {
				await open(page, name);
				expect(await sheetPlace(page, name)).toMatchObject({ top, height });

				await sheetPanel(page, name).getByRole('searchbox', { name: filter }).fill(narrow);

				await expect(sheetPanel(page, name).getByTestId('pick-item').filter({ hasText: 'Сербия' })).toBeVisible();
				expect(await sheetPlace(page, name)).toMatchObject({ top, height });
			});
		}

		test('the list of all is 640 px high or down to 12 px over the bottom', async ({ page }) => {
			await open(page, 'Все города');

			expect(await sheetPlace(page, title('Все города'))).toMatchObject({ top, height });
		});

		for (const name of ['Откуда едем', 'Что важно знать'] as const) {
			test(`«${name}» is as high as what it holds, down to 12 px over the bottom`, async ({ page }) => {
				await open(page, name);

				expect(await fromItsEnd(page, name, window.height)).toBeLessThanOrEqual(1);
			});
		}

		test('«Откуда едем» grows down as the cities found come, its top where it was', async ({ page }) => {
			await open(page, 'Откуда едем');
			const before = await sheetPlace(page, 'Откуда едем');

			await sheetPanel(page, 'Откуда едем').getByRole('searchbox', { name: 'Найти город' }).fill('Б');

			await expect(sheetPanel(page, 'Откуда едем').getByRole('button', { name: /^Белград/u })).toBeVisible();
			const after = await sheetPlace(page, 'Откуда едем');
			expect(after.top).toBe(before.top);
			expect(after.bottom).toBeGreaterThan(before.bottom);
			expect(await fromItsEnd(page, 'Откуда едем', window.height)).toBeLessThanOrEqual(1);
		});

		test('a click on the scrim beside the modal, Esc and «Закрыть» close it', async ({ page }) => {
			const sheet = page.getByRole('dialog', { name: 'Гражданство' });
			// Halfway between the window's left edge and the modal's, halfway down.
			const beside = { x: (window.width - MODAL_WIDTH) / 4, y: window.height / 2 };

			await open(page, 'Гражданство');
			await page.mouse.click(beside.x, beside.y);
			await expect(sheet).toHaveCount(0);

			await open(page, 'Гражданство');
			await page.keyboard.press('Escape');
			await expect(sheet).toHaveCount(0);

			await open(page, 'Гражданство');
			await sheet.getByRole('button', { name: 'Закрыть' }).click();
			await expect(sheet).toHaveCount(0);
		});
	});
}
