// N and the ring (spec #20 «Экран»: slider, map, the old ring while calculating; «Состояние, ссылка и память
// браузера»: TanStack Query; stories 10–15, 22): a ring is asked for when the slider is let go, rings in memory
// come back without a request, and a calculation keeps the old ring of the same origin, striped.
import { allowGeolocation, BELGRADE, expect, ringOfHours, squareRing, test } from './fixtures.ts';
import {
	dottedHours,
	dragMap,
	dragSlider,
	expectRingCard,
	firstCard,
	holdTheClock,
	mapBounds,
	phrase,
	recordSliderHours,
	ringIsStriped,
	ringOnMap,
	slider,
	sliderHour,
} from './screen.ts';

const BELGRADE_CALL = { lat: '44.81760', lon: '20.45730' };

test.beforeEach(async ({ context }) => {
	await allowGeolocation(context, BELGRADE);
});

test('letting the slider go asks for one ring, for the hours where it stopped', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await dragSlider(page, 5, async () => {
		// Dragged through 2, 3 and 4 and still held: the cell under the pointer is chosen, nothing is asked for.
		await expect(slider(page)).toHaveAttribute('aria-valuetext', '4–5 ч');
		expect(ringApi.calls).toHaveLength(1);
	});

	await expectRingCard(page, '4–5 ч');
	await expect(phrase(page)).toContainText('4–5 часов в пути.');
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 5]);
	await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=5&cit=RUS$/u);
});

test('a key moves N by an hour and asks at once', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await slider(page).press('ArrowUp');

	await expectRingCard(page, '1–2 ч');
	await expect(phrase(page)).toContainText('1–2 часа в пути.');
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 2]);
});

test('a tap on an hour chooses it and asks for one ring', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await sliderHour(page, 7).click();

	await expectRingCard(page, '6–7 ч');
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 7]);
});

test('the chosen hour reads as its span without «ч», the others as their hour', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');
	await expect(sliderHour(page, 1)).toHaveText('до 1');
	await expect(sliderHour(page, 7)).toHaveText('7');

	await sliderHour(page, 12).click();

	await expectRingCard(page, '11–12 ч');
	await expect(sliderHour(page, 12)).toHaveText('11–12');
	await expect(sliderHour(page, 1)).toHaveText('1');
});

test('letting the slider go keeps the hours where it stopped, never the old ones for a moment', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');
	const shown = await recordSliderHours(page);

	await dragSlider(page, 5);

	await expectRingCard(page, '4–5 ч');
	expect(await shown()).toEqual([2, 3, 4, 5]);
});

test('a ring in memory comes back at once, without a request, and its hours are marked', async ({ page, ringApi }) => {
	ringApi.respond(ringOfHours);
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');
	await dragSlider(page, 5);
	await expectRingCard(page, '4–5 ч');
	expect(await dottedHours(page)).toEqual([1, 5]);

	ringApi.hold();
	await dragSlider(page, 1);

	await expectRingCard(page, 'до 1 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([ringOfHours({ ...BELGRADE_CALL, hours: 1 }).ring]);
	expect(await ringIsStriped(page)).toBe(false);
	expect(ringApi.calls).toHaveLength(2);
});

test('while a ring is calculated the old ring of the same origin stays, striped, and the phrase spins', async ({ page, ringApi }) => {
	ringApi.respond((call) => (call.hours === 1 ? ringOfHours(call) : undefined));
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await dragSlider(page, 3);

	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');
	await expect(firstCard(page)).toContainText('Считаем…');
	await expect(phrase(page).getByRole('status', { name: 'Считаем' })).toBeVisible();
	await expect.poll(() => ringIsStriped(page)).toBe(true);
	expect(await ringOnMap(page)).toEqual([ringOfHours({ ...BELGRADE_CALL, hours: 1 }).ring]);

	await ringApi.answer(squareRing(BELGRADE.lat, BELGRADE.lon, [0.4, 0.9]), 3);

	await expectRingCard(page, '2–3 ч');
	await expect(phrase(page).getByRole('status', { name: 'Считаем' })).toHaveCount(0);
	await expect.poll(() => ringOnMap(page)).toEqual([squareRing(BELGRADE.lat, BELGRADE.lon, [0.4, 0.9]).ring]);
	expect(await ringIsStriped(page)).toBe(false);
});

test('a new ring is shown whole', async ({ page, ringApi }) => {
	ringApi.respond(() => squareRing(BELGRADE.lat, BELGRADE.lon, [1, 2]));
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

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
	ringApi.respond((call) => (call.lat === BELGRADE_CALL.lat ? ringOfHours(call) : undefined));
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');

	await phrase(page).getByRole('button', { name: 'Белград' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
	await dragMap(page, -150, 0);
	await page.getByRole('button', { name: 'Старт здесь' }).click();

	await expect(firstCard(page)).toContainText('Считаем…');
	await expect.poll(() => ringOnMap(page)).toEqual([]);
	expect(await ringIsStriped(page)).toBe(false);
});

test('a calculation that takes over 5 s says it takes longer than usual', async ({ page, ringApi }) => {
	// The page's time stands still from the load: the 5 s count from the card's start, whatever the machine's load.
	await holdTheClock(page);
	await page.goto('/');
	await expect(firstCard(page)).toContainText('Считаем…');

	await page.clock.runFor(4999);
	await expect(firstCard(page)).not.toContainText('Чуть дольше обычного');
	await page.clock.runFor(1);

	await expect(firstCard(page)).toContainText('Считаем…');
	await expect(firstCard(page)).toContainText('Чуть дольше обычного, досчитываем — подождите');
	await page.clock.resume();
	await ringApi.answer(ringOfHours({ ...BELGRADE_CALL, hours: 1 }));
	await expectRingCard(page, 'до 1 ч');
});

test('an answer that comes after the person moved on is not shown, but is kept in memory', async ({ page, ringApi }) => {
	ringApi.respond((call) => (call.hours === 1 ? ringOfHours(call) : undefined));
	await page.goto('/');
	await expectRingCard(page, 'до 1 ч');
	await slider(page).press('ArrowUp');
	await expect(firstCard(page)).toContainText('Кольцо 1–2 ч');
	await slider(page).press('ArrowUp');
	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');

	await ringApi.answer(ringOfHours({ ...BELGRADE_CALL, hours: 2 }), 2);

	await expect.poll(() => dottedHours(page)).toEqual([1, 2]);
	await expect(firstCard(page)).toContainText('Кольцо 2–3 ч');
	await expect(firstCard(page)).toContainText('Считаем…');
	expect(await ringOnMap(page)).toEqual([ringOfHours({ ...BELGRADE_CALL, hours: 1 }).ring]);
	await slider(page).press('ArrowDown');
	await expectRingCard(page, '1–2 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([ringOfHours({ ...BELGRADE_CALL, hours: 2 }).ring]);
	expect(ringApi.calls.map((call) => call.hours)).toEqual([1, 2, 3]);
});
