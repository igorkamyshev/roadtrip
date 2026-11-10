// The origin (spec #20 «Экран»: phrase, pin; stories 1, 3, 4, 6): geolocation on the first visit, the screen without
// it, the pin mode, and the marker where the person put it.
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { boxOf, dragMap, expectRingCard, firstCard, mapCenter, phrase, ringOnMap, slider, startOnMap, theMap } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
/** The pin mode's hint with a mouse, which moves the map either way (#107), and without one. */
const MOUSE_HINT = 'Двигайте карту мышью или стрелками, чтобы поставить точку под булавку';
const TOUCH_HINT = 'Двигайте карту, чтобы поставить точку под булавку';

test('on the first visit the ring comes for where the person is, N = 1', async ({ page, context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, 0.5]));

	await page.goto('/');

	const [call] = await ringApi.waitForCalls(1);
	expect(call).toMatchObject({ lat: '44.81760', lon: '20.45730', hours: 1, cit: 'RUS', visas: null });
	// The origin's label is the origin's city: the one of the cities file within whose limits it is.
	await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
	await expectRingCard(page, 'до 1 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([squareRing(BELGRADE.lat, BELGRADE.lon, [0, 0.5]).ring]);
	expect(await startOnMap(page)).toEqual([BELGRADE.lon, BELGRADE.lat]);
	expect(ringApi.calls).toHaveLength(1);
});

test('without geolocation «выберите» blinks in the phrase and the first card asks where from', async ({ page, ringApi }) => {
	await page.goto('/');

	await expect(phrase(page)).toContainText('Из точки выберите, до 1 часа в пути.');
	await expect(phrase(page).getByRole('button', { name: 'выберите' })).toHaveCSS('animation-name', 'blink');
	await expect(firstCard(page)).toContainText('Откуда едем?');
	await expect(firstCard(page)).toContainText('Браузер не дал доступ к геолокации. Найдите город или укажите точку на карте.');
	await expect(firstCard(page).getByRole('button', { name: 'На карте' })).toBeVisible();
	await expect(firstCard(page).getByRole('button', { name: 'Где я' })).toBeVisible();
	await expect(slider(page)).toHaveCount(0);
	expect(ringApi.calls).toHaveLength(0);
});

for (const viewport of [
	{ width: 390, height: 844 },
	{ width: 1440, height: 900 },
]) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test.describe(`on ${viewport.width}×${viewport.height}, ${colorScheme}`, () => {
			test.use({ viewport, colorScheme });

			test('«Откуда едем?» has «Город», «На карте» and «Где я» in one row on the card', async ({ page }) => {
				await page.goto('/');
				await expect(firstCard(page)).toHaveAttribute('data-state', 'no_origin');

				const card = await boxOf(firstCard(page));
				const buttons = await Promise.all(
					['Город', 'На карте', 'Где я'].map(async (name) => boxOf(firstCard(page).getByRole('button', { name }))),
				);
				const [first] = buttons;
				expect(buttons.map((button) => Math.round(button.y))).toEqual(buttons.map(() => Math.round(first.y)));
				for (const button of buttons) {
					expect(button.x).toBeGreaterThanOrEqual(card.x);
					expect(button.x + button.width).toBeLessThanOrEqual(card.x + card.width);
				}
			});
		});
	}
}

test('the sheet «Откуда едем» says when the browser gave no position', async ({ page }) => {
	await page.goto('/');
	await phrase(page).getByRole('button', { name: 'выберите' }).click();

	const sheet = page.getByRole('dialog', { name: 'Откуда едем' });
	await expect(sheet.getByRole('button', { name: 'Указать на карте' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Где я' })).toBeVisible();
	await expect(sheet).toContainText('Браузер не дал доступ к геолокации.');
});

test('«Где я» sets the origin once the browser gives the position', async ({ page, context, ringApi }) => {
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, 0.5]));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('Браузер не дал доступ к геолокации.');

	await allowGeolocation(context, BELGRADE);
	await firstCard(page).getByRole('button', { name: 'Где я' }).click();

	const [call] = await ringApi.waitForCalls(1);
	expect(call).toMatchObject({ lat: '44.81760', lon: '20.45730', hours: 1 });
	await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS$/u);
});

test('the pin puts the origin under it, where the person moved the map, and the marker stays there', async ({ page, ringApi }) => {
	// The engine snaps the origin to a road: the ring is around another point, the marker is not.
	ringApi.respond((call) => squareRing(Number(call.lat) + 0.2, Number(call.lon) + 0.2, [0, 0.5]));
	await page.goto('/');
	await firstCard(page).getByRole('button', { name: 'На карте' }).click();

	await expect(page.getByText(MOUSE_HINT)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Отмена' })).toBeVisible();
	await expect(firstCard(page)).toHaveCount(0);
	await dragMap(page, -80, -120);
	const center = await mapCenter(page);
	await page.getByRole('button', { name: 'Старт здесь' }).click();

	const lat = center.lat.toFixed(5);
	const lon = center.lon.toFixed(5);
	const [call] = await ringApi.waitForCalls(1);
	expect(call).toMatchObject({ lat, lon, hours: 1 });
	await expect(page).toHaveURL(new RegExp(`#/\\?p=${lat},${lon}&h=1&cit=RUS$`, 'u'));
	await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
	await expect(page.getByText(MOUSE_HINT)).toHaveCount(0);
	await expect.poll(() => ringOnMap(page)).toHaveLength(1);
	expect(await startOnMap(page)).toEqual([Number(lon), Number(lat)]);
});

test('«Отмена» leaves the pin mode and the origin as they were', async ({ page, context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, 0.5]));
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await phrase(page).getByRole('button', { name: 'Белград' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
	await expect(slider(page)).toHaveCount(0);
	await dragMap(page, 100, 100);
	await page.getByRole('button', { name: 'Отмена' }).click();

	await expect(slider(page)).toBeVisible();
	await expectRingCard(page, 'до 1 ч');
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS$/u);
	expect(await startOnMap(page)).toEqual([BELGRADE.lon, BELGRADE.lat]);
	expect(ringApi.calls).toHaveLength(1);
});

for (const [pointer, hint] of [
	['a mouse', MOUSE_HINT],
	['a touch screen', TOUCH_HINT],
] as const) {
	test.describe(`with ${pointer}`, () => {
		test.use({ hasTouch: pointer === 'a touch screen' });

		test(`the pin mode's hint is «${hint}»`, async ({ page }) => {
			await page.goto('/');
			await firstCard(page).getByRole('button', { name: 'На карте' }).click();

			await expect(page.getByTestId('pin-bar')).toContainText(hint);
		});
	});
}

test('the map is named «Карта» to a screen reader', async ({ page }) => {
	await page.goto('/');

	await expect(theMap(page)).toBeVisible();
	await expect(theMap(page)).not.toHaveAttribute('aria-describedby');
});

test.describe('the pin mode from the keyboard', () => {
	test.beforeEach(async ({ page, context, ringApi }) => {
		await allowGeolocation(context, BELGRADE);
		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, 0.5]));
		await page.goto('/');
		await expectRingCard(page, 'до 1 ч');
	});

	test('the map has the focus once the pin mode is on, is described by the hint, and its arrows move it at once', async ({ page }) => {
		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();

		await expect(theMap(page)).toBeFocused();
		await expect(theMap(page)).toHaveAccessibleDescription(MOUSE_HINT);
		const before = await mapCenter(page);
		await page.keyboard.press('ArrowRight');
		await expect.poll(async () => (await mapCenter(page)).lon).toBeGreaterThan(before.lon);
		// Enter on the map is not «Старт здесь».
		await page.keyboard.press('Enter');
		await expect(page.getByRole('button', { name: 'Старт здесь' })).toBeVisible();
		await expect(theMap(page)).toBeFocused();
	});

	test('Tab goes from the map to «Отмена» and «Старт здесь», and Esc is «Отмена»: the focus comes back to the origin in the phrase', async ({
		page,
		ringApi,
	}) => {
		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
		await expect(theMap(page)).toBeFocused();

		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Отмена' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Старт здесь' })).toBeFocused();
		await page.keyboard.press('Escape');

		await expect(page.getByRole('button', { name: 'Старт здесь' })).toHaveCount(0);
		await expect(slider(page)).toBeVisible();
		await expect(phrase(page).getByRole('button', { name: 'Белград' })).toBeFocused();
		expect(ringApi.calls).toHaveLength(1);
	});

	test('the focus comes back to the origin in the phrase after «Отмена» and after «Старт здесь»', async ({ page }) => {
		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
		await page.getByRole('button', { name: 'Отмена' }).click();
		await expect(phrase(page).getByRole('button', { name: 'Белград' })).toBeFocused();

		await page.keyboard.press('Enter');
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
		await expect(theMap(page)).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await page.getByRole('button', { name: 'Старт здесь' }).click();

		await expect(phrase(page).getByRole('button', { name: 'на карте' })).toBeFocused();
	});
});
