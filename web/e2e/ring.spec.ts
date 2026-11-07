// N and the ring (spec «Экран»: slider, map, the old ring while calculating; «Состояние, ссылка и память
// браузера»: TanStack Query; stories 10–15, 22): a ring is asked for when the slider is let go, rings in memory
// come back without a request, and a calculation keeps the old ring of the same origin, striped.
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { dottedHours, dragMap, dragSlider, firstCard, mapBounds, phrase, ringIsStriped, ringOnMap, slider } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const BELGRADE_CALL = { lat: '44.81760', lon: '20.45730' };

/** A ring per N: a band from N − 1 to N tenths of a degree around the origin. */
const ringFor = (call: { lat: string; lon: string; hours: number }) => squareRing(Number(call.lat), Number(call.lon), (call.hours - 1) / 10, call.hours / 10);

test.beforeEach(async ({ context }) => {
	await allowGeolocation(context, BELGRADE);
});

test('letting the slider go asks for one ring, for the hours where it stopped', async ({ page, ringApi }) => {
	ringApi.respond(ringFor);
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	await dragSlider(page, 5, async () => {
		// Dragged through 2, 3 and 4 and still held: the bubble follows, nothing is asked for.
		await expect(slider(page)).toHaveAttribute('aria-valuetext', '4–5 ч');
		expect(ringApi.calls).toHaveLength(1);
	});

	await expect(firstCard(page)).toContainText('В кольце 4–5 ч');
	await expect(phrase(page)).toContainText('4–5 часов в пути.');
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 5]);
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=5$/u);
});

test('a key moves N by an hour and asks at once', async ({ page, ringApi }) => {
	ringApi.respond(ringFor);
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	await slider(page).press('ArrowUp');

	await expect(firstCard(page)).toContainText('В кольце 1–2 ч');
	await expect(phrase(page)).toContainText('1–2 часа в пути.');
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 2]);
});

test('a ring in memory comes back at once, without a request, and its hours have dots', async ({ page, ringApi }) => {
	ringApi.respond(ringFor);
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await dragSlider(page, 5);
	await expect(firstCard(page)).toContainText('В кольце 4–5 ч');
	expect(await dottedHours(page)).toEqual([1, 5]);

	ringApi.respond(() => undefined);
	await dragSlider(page, 1);

	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([ringFor({ ...BELGRADE_CALL, hours: 1 }).ring]);
	expect(await ringIsStriped(page)).toBe(false);
	expect(ringApi.calls).toHaveLength(2);
});

test('while a ring is calculated the old ring of the same origin stays, striped, and the phrase spins', async ({ page, ringApi }) => {
	ringApi.respond((call) => (call.hours === 1 ? ringFor(call) : undefined));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	await dragSlider(page, 3);

	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');
	await expect(firstCard(page)).toContainText('Считаем…');
	await expect(phrase(page).getByRole('status', { name: 'Считаем' })).toBeVisible();
	await expect.poll(() => ringIsStriped(page)).toBe(true);
	expect(await ringOnMap(page)).toEqual([ringFor({ ...BELGRADE_CALL, hours: 1 }).ring]);

	await ringApi.answer(squareRing(BELGRADE.lat, BELGRADE.lon, 0.4, 0.9), 3);

	await expect(firstCard(page)).toContainText('В кольце 2–3 ч');
	await expect(phrase(page).getByRole('status', { name: 'Считаем' })).toHaveCount(0);
	await expect.poll(() => ringOnMap(page)).toEqual([squareRing(BELGRADE.lat, BELGRADE.lon, 0.4, 0.9).ring]);
	expect(await ringIsStriped(page)).toBe(false);
});

test('a new ring is shown whole', async ({ page, ringApi }) => {
	ringApi.respond(() => squareRing(BELGRADE.lat, BELGRADE.lon, 1, 2));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	// The overview before the map has loaded holds the ring too, so the camera is awaited until it shows the ring
	// whole and not lost in the world: not much wider than the ring with the room for the phrase and cards.
	await expect
		.poll(async () => {
			const [west, south, east, north] = await mapBounds(page);
			const whole = west <= BELGRADE.lon - 2 && east >= BELGRADE.lon + 2 && south <= BELGRADE.lat - 2 && north >= BELGRADE.lat + 2;
			return whole && east - west < 8;
		})
		.toBe(true);
});

test('the ring of another origin is not kept while the new origin’s ring is calculated', async ({ page, ringApi }) => {
	ringApi.respond((call) => (call.lat === BELGRADE_CALL.lat ? ringFor(call) : undefined));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');

	await phrase(page).getByRole('button', { name: 'на карте' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
	await dragMap(page, -150, 0);
	await page.getByRole('button', { name: 'Старт здесь' }).click();

	await expect(firstCard(page)).toContainText('Считаем…');
	await expect.poll(() => ringOnMap(page)).toEqual([]);
	expect(await ringIsStriped(page)).toBe(false);
});

test('a calculation that takes over 5 s says it takes longer than usual', async ({ page, ringApi }) => {
	await page.clock.install();
	await page.goto('/');
	await expect(firstCard(page)).toContainText('Считаем…');
	await expect(firstCard(page)).not.toContainText('Чуть дольше обычного');

	await page.clock.fastForward(4000);
	await expect(firstCard(page)).not.toContainText('Чуть дольше обычного');
	await page.clock.fastForward(1000);

	await expect(firstCard(page)).toContainText('Считаем…');
	await expect(firstCard(page)).toContainText('Чуть дольше обычного, досчитываем — подождите');
	await ringApi.answer(ringFor({ ...BELGRADE_CALL, hours: 1 }));
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
});

test('an answer that comes after the person moved on is not shown, but is kept in memory', async ({ page, ringApi }) => {
	ringApi.respond((call) => (call.hours === 1 ? ringFor(call) : undefined));
	await page.goto('/');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await slider(page).press('ArrowUp');
	await expect(firstCard(page)).toContainText('Кольцо 1–2 ч');
	await slider(page).press('ArrowUp');
	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');

	await ringApi.answer(ringFor({ ...BELGRADE_CALL, hours: 2 }), 2);

	await expect.poll(() => dottedHours(page)).toEqual([1, 2]);
	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');
	await expect(firstCard(page)).toContainText('Считаем…');
	expect(await ringOnMap(page)).toEqual([ringFor({ ...BELGRADE_CALL, hours: 1 }).ring]);
	await slider(page).press('ArrowDown');
	await expect(firstCard(page)).toContainText('В кольце 1–2 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([ringFor({ ...BELGRADE_CALL, hours: 2 }).ring]);
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 2, 3]);
});
