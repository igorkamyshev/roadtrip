// The map's camera on the wide screen (spec #20 «Экран», «Карта»; #108): the room it leaves for the panels is read
// from where they stand when it moves, a new ring or a city chosen. The free area is one rectangle, from the phrase's
// plate down to the slider's row, from edge to edge, 12 px in from each; a new ring shows whole in it, a chosen city in
// its middle. What changes later, the data's sources leaving the plate or a modal closing, moves nothing. The narrow
// screen keeps its fixed room (e2e/cities.spec.ts, e2e/ring.spec.ts). Read by the panels' boxes and the map's own
// projection of the ring and the city, never by pixels.
import type { Page } from '@playwright/test';
import { BELGRADE, BUDAPEST, expect, LONGEST, OPEN_AROUND_SERBIA, squareRing, test, visaRules } from './fixtures.ts';
import {
	boxOf,
	cityCard,
	EDGE,
	expectRingCard,
	holdTheClock,
	labelsOnMap,
	LAST_HOUR_RING,
	mapAtRest,
	phrase,
	ringOnMap,
	runUntil,
	runUntilMapAtRest,
	settle,
	slider,
	sources,
	whereOnScreen,
} from './screen.ts';
import { onWindow, WIDE_WINDOWS, windowName } from './windows.ts';

/** The ring of every answer: a band from 1° to 3° around Belgrade. */
const RING = squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]);
/** Another ring: a band from 0.5° to 1.5°. */
const NARROWER = squareRing(BELGRADE.lat, BELGRADE.lon, [0.5, 1.5]);

/** A projected point may land this far off, in CSS pixels. */
const PIXEL = 1;
/** Longer than the data's sources stay in the phrase's plate once the screen opens. */
const SOURCES_PAST_MS = 6000;

/** The free area of the wide screen now: from the phrase's plate down to the slider's row, from edge to edge, 12 px in. */
async function freeArea(page: Page): Promise<{ top: number; right: number; bottom: number; left: number }> {
	const [plate, row] = await Promise.all([boxOf(phrase(page)), boxOf(slider(page))]);
	const { width } = page.viewportSize() ?? { width: 0 };
	return { top: plate.y + plate.height + EDGE, right: width - EDGE, bottom: row.y - EDGE, left: EDGE };
}

/** The frame of the ring the map shows, its source's west, south, east and north, where the map draws it on the screen. */
async function ringFrame(page: Page): Promise<{ top: number; right: number; bottom: number; left: number }> {
	const positions = (await ringOnMap(page)).flatMap((ring) => (ring.type === 'MultiPolygon' ? ring.coordinates.flat(2) : []));
	const lons = positions.map(([lon]) => lon);
	const lats = positions.map(([, lat]) => lat);
	const [northWest, southEast] = await Promise.all([
		whereOnScreen(page, { lat: Math.max(...lats), lon: Math.min(...lons) }),
		whereOnScreen(page, { lat: Math.min(...lats), lon: Math.max(...lons) }),
	]);
	return { top: northWest.y, right: southEast.x, bottom: southEast.y, left: northWest.x };
}

/** The frame lies in the area, give or take a pixel. */
function expectWithin(frame: Awaited<ReturnType<typeof ringFrame>>, area: Awaited<ReturnType<typeof freeArea>>): void {
	expect(frame.top, 'the ring under the plate').toBeGreaterThanOrEqual(area.top - PIXEL);
	expect(frame.bottom, 'the ring over the slider').toBeLessThanOrEqual(area.bottom + PIXEL);
	expect(frame.left, 'the ring off the left edge').toBeGreaterThanOrEqual(area.left - PIXEL);
	expect(frame.right, 'the ring off the right edge').toBeLessThanOrEqual(area.right + PIXEL);
}

/** The map's centre and zoom, once it has stopped. */
async function view(page: Page): Promise<unknown> {
	await mapAtRest(page);
	return page.evaluate(() => {
		const map = window.mapForTests;
		return map && { center: map.getCenter(), zoom: map.getZoom() };
	});
}

test.beforeEach(({ ringApi }) => {
	ringApi.respond(() => ({ ...RING, ...visaRules(OPEN_AROUND_SERBIA) }));
});

for (const window of WIDE_WINDOWS) {
	test.describe(`on ${windowName(window)}`, () => {
		test.use(onWindow(window));

		test('with the longest phrase and the sources in its plate, a new ring shows whole between the plate and the slider, and stays when the sources leave', async ({
			page,
		}) => {
			// The clock held, then run past the map's flight but not the sources' 5 s.
			await holdTheClock(page);
			await page.goto(LONGEST);
			await expectRingCard(page, LAST_HOUR_RING);
			await runUntilMapAtRest(page);
			await expect(sources(page)).toBeVisible();

			expectWithin(await ringFrame(page), await freeArea(page));
			const before = await view(page);

			await page.clock.runFor(5000);

			await expect(sources(page)).toHaveCount(0);
			expect(await view(page)).toEqual(before);
		});

		test('a city chosen by a click on its card comes to the middle of the free area', async ({ page }) => {
			await holdTheClock(page);
			await page.goto(LONGEST);
			await expectRingCard(page, LAST_HOUR_RING);
			await runUntilMapAtRest(page);
			// Past the sources' 5 s: the plate is as low as it stays.
			await page.clock.runFor(SOURCES_PAST_MS);
			await expect(sources(page)).toHaveCount(0);

			await cityCard(page, 'Будапешт').getByRole('button', { name: 'Будапешт' }).click();

			await settle(page);
			await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Будапешт']);
			const [at, area] = await Promise.all([whereOnScreen(page, BUDAPEST), freeArea(page)]);
			expect(Math.abs(at.x - (area.left + area.right) / 2), 'across').toBeLessThanOrEqual(PIXEL);
			expect(Math.abs(at.y - (area.top + area.bottom) / 2), 'down').toBeLessThanOrEqual(PIXEL);
		});

		test('a ring that comes while a modal is open shows whole in the free area once it closes', async ({ page, ringApi }) => {
			// Without the US visa the ring is a narrower band: the camera comes closer.
			ringApi.respond((call) => ({ ...(call.visas?.includes('USA') === true ? RING : NARROWER), ...visaRules(OPEN_AROUND_SERBIA) }));
			await holdTheClock(page);
			await page.goto(LONGEST);
			await expectRingCard(page, LAST_HOUR_RING);
			await runUntilMapAtRest(page);
			await page.clock.runFor(SOURCES_PAST_MS);
			await expect(sources(page)).toHaveCount(0);

			await phrase(page).getByRole('button', { name: /США/u }).click();
			const visas = page.getByRole('dialog', { name: 'Мои визы' });
			await visas.getByTestId('pick-item').filter({ hasText: /^США/u }).click();
			// The new ring, which comes on the page's timers, and the map's flight to it.
			const narrower = JSON.stringify([NARROWER.ring]);
			await runUntil(page, async () => JSON.stringify(await ringOnMap(page)) === narrower, 'the narrower ring on the map');
			await settle(page);
			await expect(visas).toBeVisible();

			await page.keyboard.press('Escape');

			await expect(page.getByRole('dialog')).toHaveCount(0);
			expectWithin(await ringFrame(page), await freeArea(page));
		});
	});
}
