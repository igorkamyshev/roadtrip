// The places of the origin (GLOSSARY «Место точки старта», spec #154 «Отбор мест кольца», story 20 of #154): a place
// the origin is inside or near is in no ring, neither in the carousel, the list of all nor on the map, and the first
// card does not count it. The screen tells them by the cell of the places' outlines that holds the origin
// (`PLACE_CELLS` of the fixtures): by a large place's outline and by a small place's radius. A distance below is the larger of |Δlat| and
// |Δlon|, which is what decides whether `squareRing` holds a point.
import type { Page } from '@playwright/test';
import { carouselRing, expect, LINK_3_HOURS, OPEN_AROUND_SERBIA, servePlaceOutlines, squareRing, test, visaRules } from './fixtures.ts';
import { citiesOnMap, firstCard, holdTheClock, moreCard, placesOnMap, pointCards, read, runUntil, runUntilMapAtRest } from './screen.ts';

/** A ring from the origin to `outer` degrees around it, whatever the origin, with a Russian's entry in Serbia. */
const bandFromOrigin = (outer: number) => (call: { readonly lat: string; readonly lon: string }) => ({
	...squareRing(Number(call.lat), Number(call.lon), [0, outer]),
	...visaRules(),
});

/** The names of the rows of «Всё в кольце …» the list has drawn, its top ones. */
async function namesInTheList(page: Page): Promise<string[]> {
	await moreCard(page).click();
	return page
		.getByRole('dialog', { name: /^Всё в кольце/u })
		.getByTestId('row-name')
		.allInnerTexts();
}

test('a large place the origin is inside is nowhere, and the first card does not count it', async ({ page, ringApi }) => {
	// Inside Deliblato Sands, 3° around with every country around open: its access points (0.11°, 0.05°), 24 cities
	// (all of `CITIES` but Pristina, closed, and Mostar, 3.29°) and 8 other places (not Balaton, 3.04°, nor Vjetrenica,
	// 3.12°). Deliblato's 34 sitelinks, 51, would put its card 6th, after Studenica (66).
	ringApi.respond((call) => ({ ...bandFromOrigin(3)(call), ...visaRules(OPEN_AROUND_SERBIA) }));
	await page.goto('/#/?p=44.95000,21.10000&h=3');

	await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 32 точки интереса в 6 странах Листайте → самое известное');
	const carouselNames = [
		'Будапешт',
		'Белград',
		'Хортобадь',
		'Сараево',
		'Монастырь Студеница',
		'Тимишоара',
		'Ниш',
		'Джердап',
		'Подгорица',
		'Нови-Сад',
		'Дебрецен',
		'Лепенски-Вир',
	];
	await expect(pointCards(page).getByRole('heading')).toHaveText(carouselNames);
	// On the map, the 24 cities' dots and the 8 other places' diamonds, not Deliblato's.
	await expect.poll(async () => [(await citiesOnMap(page)).length, (await placesOnMap(page)).length]).toEqual([24, 8]);
	expect((await placesOnMap(page)).map(({ name }) => name)).not.toContain('Делиблатские пески');
	const listed = await namesInTheList(page);
	expect([listed.slice(0, 12), listed.includes('Делиблатские пески')]).toEqual([carouselNames, false]);
});

// Manasija (44.1009°N) is a small place: its cell holds a radius of 1.3 km around its point (`PLACE_CELLS`). 0.011241°
// and 0.012141° north of it are 1.25 km and 1.35 km.
for (const { title, link, cards } of [
	{ title: 'a small place 1.25 km from the origin, within its radius, is nowhere', link: '/#/?p=44.11214,21.46960&h=3', cards: [] },
	{
		title: 'a small place 1.35 km from the origin, past its radius, is there',
		link: '/#/?p=44.11304,21.46960&h=3',
		cards: ['Монастырь Манасия'],
	},
]) {
	test(title, async ({ page, ringApi }) => {
		// 0.25° around: Manasija's access point, and no city.
		ringApi.respond(bandFromOrigin(0.25));
		await page.goto(link);

		await expect(firstCard(page)).toHaveAttribute('data-state', cards.length === 0 ? 'no_points' : 'ring');
		await expect(pointCards(page).getByRole('heading')).toHaveText(cards);
	});
}

test('without the cell of the outlines, the cities alone, and nothing said of it', async ({ page, ringApi }) => {
	await servePlaceOutlines(page, undefined);
	ringApi.respond(() => carouselRing());
	await page.goto(LINK_3_HOURS);

	await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 16 точек интереса в 6 странах Листайте → самое известное');
	await expect(pointCards(page).getByRole('heading').first()).toHaveText('Будапешт');
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('wait for the cell of the outlines: no card shows before it comes, so the carousel is not built anew', async ({ page, ringApi }) => {
	const { promise: cell, resolve: release } = Promise.withResolvers<void>();
	await page.route('**/data/place-outlines/*', async (route) => {
		await cell;
		await route.fallback();
	});
	const placesCame = page.waitForResponse('**/data/places.json');
	ringApi.respond(() => carouselRing());
	await holdTheClock(page);
	await page.goto(LINK_3_HOURS);
	await placesCame;
	await runUntil(page, async () => (await firstCard(page).getAttribute('data-state')) === 'ring', 'the ring answered');
	await runUntilMapAtRest(page);

	// The ring and both files are in, the cell not: the first card has no count yet, and there are no cards.
	expect([await read(firstCard(page)), await pointCards(page).count()]).toEqual(['В кольце 2–3 ч', 0]);

	release();
	await runUntil(page, async () => (await pointCards(page).count()) === 12, 'the 12 cards');
	await expect(moreCard(page)).toBeVisible();
});
