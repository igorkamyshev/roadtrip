// The state in the link and in the browser (spec «Состояние, ссылка и память браузера»; stories 43–45): on load
// the link wins, then the saved state, then the defaults; every change is in the link, without new history
// entries, and saved; invalid parameters take their defaults.
import type { Page } from '@playwright/test';
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { dragSlider, expectRingCard, phrase, slider } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const SARAJEVO = '43.85630,18.41310';
const NIS = '43.32470,21.90330';

test.beforeEach(async ({ context, ringApi }) => {
	// The person is in Belgrade and lets the site know: a link or the saved state must still win.
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, call.hours / 10]));
});

/** A new load of the page, as after closing the tab: the browser's storage stays, the memory of rings does not. */
async function reopen(page: Page, path: string): Promise<void> {
	await page.goto('about:blank');
	await page.goto(path);
}

test('a link opens its own state, not where the person is', async ({ page, ringApi }) => {
	await page.goto(`/#/?p=${SARAJEVO}&h=2`);

	await expectRingCard(page, '1–2 ч');
	// The origin's label is the nearest city of the cities file.
	await expect(phrase(page)).toContainText('Из точки Сараево, 1–2 часа в пути.');
	await expect(slider(page)).toHaveAttribute('aria-valuenow', '2');
	expect(ringApi.calls).toEqual([expect.objectContaining({ lat: '43.85630', lon: '18.41310', hours: 2 })]);
	await expect(page).toHaveURL(new RegExp(`#/\\?p=${SARAJEVO}&h=2&cit=RUS$`, 'u'));
});

test('without a link the saved state opens, and goes into the link', async ({ page, ringApi }) => {
	await page.goto(`/#/?p=${SARAJEVO}&h=2`);
	await expectRingCard(page, '1–2 ч');

	await reopen(page, '/');

	await expect(page).toHaveURL(new RegExp(`#/\\?p=${SARAJEVO}&h=2&cit=RUS$`, 'u'));
	await expectRingCard(page, '1–2 ч');
	expect(ringApi.calls.map((call) => [call.lat, call.lon, call.hours])).toEqual([
		['43.85630', '18.41310', 2],
		['43.85630', '18.41310', 2],
	]);
});

test('an opened link overwrites the saved state', async ({ page, ringApi }) => {
	await page.goto(`/#/?p=${SARAJEVO}&h=2`);
	await expectRingCard(page, '1–2 ч');

	await reopen(page, `/#/?p=${NIS}&h=6`);
	await expectRingCard(page, '5–6 ч');
	await reopen(page, '/');

	await expect(page).toHaveURL(new RegExp(`#/\\?p=${NIS}&h=6&cit=RUS$`, 'u'));
	await expectRingCard(page, '5–6 ч');
	expect(ringApi.calls.at(-1)).toMatchObject({ lat: '43.32470', lon: '21.90330', hours: 6 });
});

test('every change goes into the link without a new history entry, and is saved', async ({ page }) => {
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');
	const entries = await page.evaluate(() => history.length);

	await dragSlider(page, 4);
	await expectRingCard(page, '3–4 ч');
	await slider(page).press('ArrowDown');
	await expectRingCard(page, '2–3 ч');
	// Sheets are not part of the state.
	await phrase(page).getByRole('button', { name: 'Что важно знать' }).click();

	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=3&cit=RUS$/u);
	expect(await page.evaluate(() => history.length)).toBe(entries);
	await reopen(page, '/');
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=3&cit=RUS$/u);
	await expectRingCard(page, '2–3 ч');
});

const invalidLinks: readonly { link: string; becomes: string }[] = [
	{ link: '/#/?p=abc&h=99', becomes: '#/?p=44.81760,20.45730&h=1&cit=RUS' },
	{ link: '/#/?p=91.00000,20.00000&h=0', becomes: '#/?p=44.81760,20.45730&h=1&cit=RUS' },
	{ link: '/#/?p=44.81760,181&h=2.5', becomes: '#/?p=44.81760,20.45730&h=1&cit=RUS' },
	{ link: `/#/?p=${SARAJEVO}&h=13`, becomes: `#/?p=${SARAJEVO}&h=1&cit=RUS` },
	{ link: '/#/?p=43.8563,18.4131&h=03', becomes: `#/?p=${SARAJEVO}&h=3&cit=RUS` },
];

for (const { link, becomes } of invalidLinks) {
	test(`an invalid parameter takes its default: ${link}`, async ({ page, ringApi }) => {
		await page.goto(link);

		await expect(page).toHaveURL((url) => url.hash === becomes);
		const [call] = await ringApi.waitForCalls(1);
		const [, lat, lon, hours] = /p=([^,]+),([^&]+)&h=(\d+)/u.exec(becomes) ?? [];
		expect(call).toMatchObject({ lat, lon, hours: Number(hours) });
	});
}
