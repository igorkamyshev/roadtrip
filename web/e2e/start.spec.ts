// The origin (spec «Экран»: phrase, pin; stories 1, 3, 4, 6): geolocation on the first visit, the screen without
// it, the pin mode, and the marker where the person put it.
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { dragMap, firstCard, mapCenter, phrase, ringOnMap, slider, startOnMap } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };

test('on the first visit the ring comes for where the person is, N = 1', async ({ page, context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));

	await page.goto('/');

	const [call] = await ringApi.waitForCalls(1);
	expect(call).toMatchObject({ lat: '44.81760', lon: '20.45730', hours: 1, cit: 'RUS', visas: null });
	// The origin's label is the nearest city of the cities file.
	await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([squareRing(BELGRADE.lat, BELGRADE.lon, 0, 0.5).ring]);
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

test('the sheet «Откуда едем» says when the browser gave no position', async ({ page }) => {
	await page.goto('/');
	await phrase(page).getByRole('button', { name: 'выберите' }).click();

	const sheet = page.getByRole('dialog', { name: 'Откуда едем' });
	await expect(sheet.getByRole('button', { name: 'Указать на карте' })).toBeVisible();
	await expect(sheet.getByRole('button', { name: 'Где я' })).toBeVisible();
	await expect(sheet).toContainText('Браузер не дал доступ к геолокации.');
});

test('«Где я» sets the origin once the browser gives the position', async ({ page, context, ringApi }) => {
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));
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
	ringApi.respond((call) => squareRing(Number(call.lat) + 0.2, Number(call.lon) + 0.2, 0, 0.5));
	await page.goto('/');
	await firstCard(page).getByRole('button', { name: 'На карте' }).click();

	await expect(page.getByText('Двигайте карту, чтобы поставить точку под булавку')).toBeVisible();
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
	await expect(page.getByText('Двигайте карту, чтобы поставить точку под булавку')).toHaveCount(0);
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	expect(await startOnMap(page)).toEqual([Number(lon), Number(lat)]);
});

test('«Отмена» leaves the pin mode and the origin as they were', async ({ page, context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	await phrase(page).getByRole('button', { name: 'Белград' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
	await expect(slider(page)).toHaveCount(0);
	await dragMap(page, 100, 100);
	await page.getByRole('button', { name: 'Отмена' }).click();

	await expect(slider(page)).toBeVisible();
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS$/u);
	expect(await startOnMap(page)).toEqual([BELGRADE.lon, BELGRADE.lat]);
	expect(ringApi.calls).toHaveLength(1);
});
