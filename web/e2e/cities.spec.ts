// The cities in the ring (spec #20 «Экран»: «Города в кольце», «Карусель», «Карточка города», the first card «нет
// городов»; stories 35–42): which cities the screen picks of the cities file, the carousel, the list of all cities,
// the cards, and how the carousel and the map follow each other. The cities are `CITIES` of the fixtures, real ones
// around Belgrade, or a test's own; their distance from Belgrade below is the larger of |Δlat| and |Δlon|, which is
// what decides whether `squareRing` holds them.
import type { Locator, Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { allowGeolocation, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import {
	boxOf,
	carousel,
	citiesOnMap,
	distanceFromTheMiddle,
	dragMap,
	expectRingCard,
	firstCard,
	labelsOnMap,
	mapAtRest,
	mapZoom,
	phrase,
	slider,
	sliderHour,
	tapMap,
} from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=3';
const BUDAPEST = { lat: 47.498, lon: 19.04 };
const NIS = { lat: 43.325, lon: 21.903 };

/** Longer than any easing of the map's camera: MapLibre's `easeTo` takes 500 ms. */
const EASING_PAST_MS = 2000;

/** A Russian's entry modes around Serbia, the start country. */
const RUSSIAN: Access = {
	SRB: { mode: 'start' },
	BIH: { mode: 'visa_free', citizenship: 'RUS' },
	MNE: { mode: 'visa_free', citizenship: 'RUS' },
	HUN: { mode: 'closed' },
	ROU: { mode: 'closed' },
	HRV: { mode: 'closed' },
	RKS: { mode: 'closed', closedForEveryone: true },
};

/** A Russian with a Schengen visa: Hungary, Romania and Croatia open by it. */
const WITH_SCHENGEN_VISA: Access = {
	...RUSSIAN,
	HUN: { mode: 'held_visa', visa: 'SCHENGEN' },
	ROU: { mode: 'held_visa', visa: 'SCHENGEN' },
	HRV: { mode: 'held_visa', visa: 'SCHENGEN' },
};

/** The cards of the carousel's cities, in order. */
const cityCards = (page: Page) => page.getByTestId('city-card');

/** The ring 2–3 h as a band from 1° to 3° around Belgrade, with these entry modes. */
function ringAroundBelgrade(access: Access) {
	return { ...squareRing(BELGRADE.lat, BELGRADE.lon, [1, 3]), ...visaRules(access) };
}

/** What a person reads in an element: its inner text with the line breaks as spaces. */
async function read(locator: Locator): Promise<string> {
	return (await locator.innerText()).replaceAll(/\s+/gu, ' ').trim();
}

test.beforeEach(async ({ context }) => {
	await allowGeolocation(context, BELGRADE);
});

test.describe('the first card', () => {
	test('counts the cities in the ring whose countries are open, and their countries', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);

		// From 1° to 3°, in Serbia, Bosnia and Herzegovina and Montenegro: Sarajevo 2.1°, Niš 1.5°, Podgorica 2.4°,
		// Tuzla 1.8°, Mostar 2.6°, Subotica 1.3°, Lukavac 1.9°. Not Belgrade, 0.01°, in the ring's hole, nor
		// Kragujevac, 0.8°, nor Budapest, 2.7°, in Hungary, closed, nor Pristina, 2.1°, in Kosovo, closed for everyone.
		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 7 городов в 3 странах Листайте → самые крупные');
	});

	test('says «Городов в кольце нет» for a ring without cities of 15 000 people', async ({ page, ringApi }) => {
		// From 0.02° to 0.1°: Belgrade, 0.01°, is in the hole, Pančevo, 0.18°, outside.
		ringApi.respond(() => ({ ...squareRing(BELGRADE.lat, BELGRADE.lon, [0.02, 0.1]), ...visaRules(RUSSIAN) }));
		await page.goto(LINK);

		await expect.poll(() => read(firstCard(page))).toBe('Городов в кольце нет Показываем города больше 15 000 жителей.');
		await expect(cityCards(page)).toHaveCount(0);
	});

	test('takes the cities of Northern Cyprus by their zone, open while Cyprus is closed', async ({ page, ringApi }) => {
		await serveCities(page, [
			[146268, 'Никосия', 'Nicosia', 35.173, 33.354, 200_452, 'CYP'],
			[146617, 'Фамагуста', 'Famagusta', 35.125, 33.941, 42_526, 'NX'],
			[146412, 'Кирения', 'Kyrenia', 35.336, 33.317, 26_701, 'NX'],
		]);
		ringApi.respond((call) => ({
			...squareRing(Number(call.lat), Number(call.lon), [0, 1]),
			...visaRules({ CYP: { mode: 'closed' }, NX: { mode: 'visa_free', citizenship: 'RUS' } }),
		}));
		await page.goto('/#/?p=35.20000,33.40000&h=2');

		await expect.poll(() => read(firstCard(page))).toBe('В кольце 1–2 ч 2 города в 1 стране Листайте → самые крупные');
		await expect(cityCards(page).getByTestId('city-facts')).toHaveText([
			'Famagusta · Северный Кипр · 43 тыс.',
			'Kyrenia · Северный Кипр · 27 тыс.',
		]);
	});

	test('leaves out the cities of a closed territory', async ({ page, ringApi }) => {
		await serveCities(page, [
			[693805, 'Симферополь', 'Simferopol', 44.952, 34.102, 336_460, 'CRIMEA'],
			[694423, 'Севастополь', 'Sevastopol', 44.6, 33.523, 547_820, 'CRIMEA'],
			[706448, 'Херсон', 'Kherson', 46.636, 32.617, 286_958, 'UKR'],
		]);
		// Access names Crimea closed for everyone, or does not name it at all: neither opens it.
		const closedForEveryone: Access = { CRIMEA: { mode: 'closed', closedForEveryone: true } };
		for (const crimea of [closedForEveryone, {}]) {
			ringApi.respond((call) => ({
				...squareRing(Number(call.lat), Number(call.lon), [0, 2]),
				...visaRules({ ...crimea, UKR: { mode: 'visa_free', citizenship: 'SRB' } }),
			}));
			await page.goto(`/#/?p=45.50000,33.50000&h=${'CRIMEA' in crimea ? 2 : 3}&cit=SRB`);

			await expect(cityCards(page).getByRole('heading')).toHaveText(['Херсон']);
		}
	});
});

test.describe('the carousel', () => {
	test('shows the 12 biggest cities after the first card, and «и ещё K» opens the list of all', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);

		// 16 cities from 1° to 3°, all but Pristina's Kosovo open: the 12 biggest, then 4 more.
		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 16 городов в 6 странах Листайте → самые крупные');
		await expect(cityCards(page).getByRole('heading')).toHaveText([
			'Будапешт',
			'Сараево',
			'Ниш',
			'Подгорица',
			'Дебрецен',
			'Арад',
			'Сегед',
			'Печ',
			'Тузла',
			'Кечкемет',
			'Мостар',
			'Суботица',
		]);
		const more = page.getByRole('button', { name: /и ещё/u });
		expect(await read(more)).toBe('и ещё 4 Все города →');

		await more.click();

		await expect(page.getByRole('dialog', { name: '16 городов в кольце 2–3 ч' })).toBeVisible();
	});

	test('has no «и ещё» card for 12 cities or fewer', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);

		await expect(cityCards(page)).toHaveCount(7);
		await expect(page.getByRole('button', { name: /и ещё/u })).toHaveCount(0);
	});
});

/** The sheet with the list of all cities of the ring, and its rows. */
const allCities = (page: Page) => page.getByRole('dialog', { name: /в кольце/u });
const rows = (page: Page) => allCities(page).getByTestId('city-row');

test.describe('the list of all cities', () => {
	test('lists every city of the ring, biggest first, with its country, population and entry mode', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);
		await page.getByRole('button', { name: /и ещё/u }).click();

		await expect(rows(page)).toHaveCount(16);
		expect(await Promise.all((await rows(page).all()).slice(0, 3).map((row) => read(row)))).toEqual([
			'Будапешт Budapest Венгрия · 1,7 млн по визе Шенгена',
			'Сараево Sarajevo Босния и Герцеговина · 697 тыс.',
			'Ниш Niš Сербия · 250 тыс. страна старта',
		]);
		expect(await read(rows(page).last())).toBe('Lukavac Босния и Герцеговина · 45 тыс.');

		await allCities(page).getByRole('button', { name: 'Закрыть' }).click();
		await expect(allCities(page)).toHaveCount(0);
	});

	test('keeps only the rows in view on the page, for the thousands of cities of a long ring', async ({ page, ringApi }) => {
		// 3 000 cities in Serbia between 1.5° and 2.5° from Belgrade, the n-th of 100 000 − n people.
		await serveCities(
			page,
			Array.from(
				{ length: 3000 },
				(_, n) =>
					[
						n + 1,
						`Город ${n + 1}`,
						`Grad ${n + 1}`,
						BELGRADE.lat + 1.5 + (n % 100) / 100,
						BELGRADE.lon - 1 + Math.floor(n / 100) / 15,
						100_000 - n,
						'SRB',
					] as const,
			),
		);
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);
		await expect.poll(() => read(firstCard(page))).toContain('3000 городов в 1 стране');
		await page.getByRole('button', { name: /и ещё/u }).click();

		await expect(rows(page).first()).toContainText('Город 1');
		expect(await rows(page).count()).toBeLessThan(50);

		await allCities(page)
			.getByTestId('sheet-body')
			.evaluate((body) => {
				body.scrollTop = body.scrollHeight;
			});

		await expect(rows(page).last()).toContainText('Город 3000');
		expect(await rows(page).count()).toBeLessThan(50);
	});
});

/** The answer of a ring from 0° to `degrees` around the origin asked for, with these entry modes. */
const aroundTheOrigin =
	(degrees: number, access: Access = RUSSIAN) =>
	(call: { readonly lat: string; readonly lon: string }) => ({
		...squareRing(Number(call.lat), Number(call.lon), [0, degrees]),
		...visaRules(access),
	});

test.describe("the origin's city", () => {
	test('is no city of the ring at 1 hour: no card, no label on the map, no row of the list of all, not counted', async ({
		page,
		ringApi,
	}) => {
		// The origin is 1.6 km from Belgrade, within its limits of 10 km. From 0° to 3°, all of `CITIES` but Pristina,
		// in Kosovo, closed for everyone, and Belgrade: 24 cities in 6 countries.
		ringApi.respond(aroundTheOrigin(3, WITH_SCHENGEN_VISA));
		await page.goto('/#/?p=44.81760,20.45730&h=1');
		await expectRingCard(page, 'до 1 ч');

		await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
		expect(await read(firstCard(page))).toBe('В кольце до 1 ч 24 города в 6 странах Листайте → самые крупные');
		await expect(cityCards(page).getByRole('heading')).toHaveText([
			'Будапешт',
			'Сараево',
			'Тимишоара',
			'Ниш',
			'Подгорица',
			'Нови-Сад',
			'Дебрецен',
			'Арад',
			'Сегед',
			'Крагуевац',
			'Печ',
			'Тузла',
		]);
		await expect.poll(async () => (await citiesOnMap(page)).length).toBe(24);
		expect((await citiesOnMap(page)).map((city) => city.name)).not.toContain('Белград');

		await page.getByRole('button', { name: /и ещё/u }).click();

		// Belgrade, the second biggest, would be the second row.
		await expect(rows(page).first()).toBeVisible();
		expect(await Promise.all((await rows(page).all()).slice(0, 2).map((row) => read(row)))).toEqual([
			'Будапешт Budapest Венгрия · 1,7 млн по визе Шенгена',
			'Сараево Sarajevo Босния и Герцеговина · 697 тыс.',
		]);
	});

	test('is Belgrade in Zemun, a part of Belgrade the cities file has not', async ({ page, ringApi }) => {
		// Zemun is 6.9 km from Belgrade. From 0° to 0.5°: Belgrade, 0.06°, and Pančevo, 0.24°.
		ringApi.respond(aroundTheOrigin(0.5));
		await page.goto('/#/?p=44.84580,20.40116&h=1');
		await expectRingCard(page, 'до 1 ч');

		await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
		await expect(cityCards(page).getByRole('heading')).toHaveText(['Панчево']);
	});

	test('is no city of the ring at 2 hours either, when the band holds it', async ({ page, ringApi }) => {
		// From Zemun, a band from 0.05° to 0.5°: Belgrade, 0.06°, is in it, as is Pančevo, 0.24°.
		ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), [0.05, 0.5]), ...visaRules(RUSSIAN) }));
		await page.goto('/#/?p=44.84580,20.40116&h=2');
		await expectRingCard(page, '1–2 ч');

		await expect(cityCards(page).getByRole('heading')).toHaveText(['Панчево']);
	});

	test('is none near Belgrade outside the limits of every city: Belgrade is in the ring, and the phrase says «на карте»', async ({
		page,
		ringApi,
	}) => {
		// 11.6 km from Belgrade, outside its limits of 10 km. From 0° to 0.5°: Belgrade, 0.1°, Pančevo, 0.19°, and
		// Smederevo, 0.48°.
		ringApi.respond(aroundTheOrigin(0.5));
		await page.goto('/#/?p=44.70000,20.45000&h=1');
		await expectRingCard(page, 'до 1 ч');

		await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
		await expect(cityCards(page).getByRole('heading')).toHaveText(['Белград', 'Панчево', 'Смедерево']);
	});

	test('is the nearest of two whose limits hold the origin: the other stays in the ring', async ({ page, ringApi }) => {
		// Two cities of a million, 9 km of limits each, 7.9 km apart; the origin is 4.7 km from the first, 3.1 km from
		// the second.
		await serveCities(page, [
			[1, 'Первый', 'Prvi', 45, 20, 1_000_000, 'SRB'],
			[2, 'Второй', 'Drugi', 45, 20.1, 1_000_000, 'SRB'],
		]);
		ringApi.respond(aroundTheOrigin(0.5));
		await page.goto('/#/?p=45.00000,20.06000&h=1');
		await expectRingCard(page, 'до 1 ч');

		await expect(phrase(page)).toContainText('Из точки Второй, до 1 часа в пути.');
		await expect(cityCards(page).getByRole('heading')).toHaveText(['Первый']);
	});

	test('is the city of the search, which the ring leaves out', async ({ page, ringApi }) => {
		// From Niš to Belgrade; from 0° to 0.5° of Belgrade: Pančevo, 0.18°, and Smederevo, 0.46°.
		ringApi.respond(aroundTheOrigin(0.5));
		await page.goto('/#/?p=43.32500,21.90300&h=1');
		await expectRingCard(page, 'до 1 ч');
		await phrase(page).getByRole('button', { name: 'Ниш' }).click();
		await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('searchbox', { name: 'Найти город' }).fill('Белград');
		await page
			.getByRole('dialog', { name: 'Откуда едем' })
			.getByRole('button', { name: /^Белград/u })
			.click();

		await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
		await expect(cityCards(page).getByRole('heading')).toHaveText(['Панчево', 'Смедерево']);
	});
});

/** The cards of the carousel, as the person scrolls it until the card is the current one, at its left edge. */
async function scrollTo(page: Page, name: string): Promise<void> {
	await cityCards(page)
		.filter({ has: page.getByRole('heading', { name, exact: true }) })
		.evaluate((card) => {
			card.scrollIntoView({ inline: 'start', block: 'nearest' });
		});
}

/** The card of the chosen city: the carousel marks it current. */
const chosenCard = (page: Page) => cityCards(page).and(page.locator('[aria-current="true"]'));

/**
 * Opens the list of all by «и ещё», at the carousel's end, as a person would: scrolls the carousel there, lets it stop,
 * then taps «и ещё». The stop chooses the card at the left edge 140 ms after the carousel's last `scroll` event, which
 * the browser sends with a later frame: the test waits for `scrollend`, after that event, before it runs the page's
 * clock past the stop, so the stop cannot come after the city the test picks next (#115).
 */
async function openTheList(page: Page): Promise<void> {
	await carousel(page).evaluate(async (element) => {
		const end = element.scrollWidth - element.clientWidth;
		// Already there (to a pixel: `scrollLeft` may be fractional), it would not scroll, and no `scrollend` would come.
		if (element.scrollLeft < end - 1) {
			const ended = new Promise((resolve) => {
				element.addEventListener('scrollend', resolve, { once: true });
			});
			element.scrollTo({ left: end });
			await ended;
		}
	});
	await page.clock.fastForward(1000);
	await page.getByRole('button', { name: /и ещё/u }).click();
}

/**
 * Taps the card where the carousel shows it, on its heading's line, as a finger would: a card past the current one
 * only peeks out from under the slider, and a click of Playwright's would scroll it into view first.
 */
async function tapCard(page: Page, name: string): Promise<void> {
	const [cardBox, headingBox, carouselBox, sliderBox] = await Promise.all([
		boxOf(card(page, name)),
		boxOf(card(page, name).getByRole('heading')),
		boxOf(carousel(page)),
		boxOf(slider(page)),
	]);
	const left = Math.max(cardBox.x, carouselBox.x);
	const right = Math.min(cardBox.x + cardBox.width, sliderBox.x - 8);
	await page.mouse.click((left + right) / 2, headingBox.y + headingBox.height / 2);
}

/** How far the place is from the middle of the map once the camera went to it: past its easing, by the page's clock. */
async function wentTo(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<number> {
	await page.clock.fastForward(EASING_PAST_MS);
	return distanceFromTheMiddle(page, at);
}

test.describe('the carousel and the map', () => {
	test.beforeEach(async ({ page, ringApi }) => {
		// The page's clock, which the map's easing runs by: a test moves it past the easing, whatever the machine's load.
		await page.clock.install();
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);
		await expect(cityCards(page)).toHaveCount(12);
		// The map is a chunk of its own: the carousel moves it once it is up and has fit the ring.
		await mapAtRest(page);
	});

	test("the map labels the carousel's cities, and dots the others of the ring", async ({ page }) => {
		await expect
			.poll(() => labelsOnMap(page))
			.toEqual({
				labels: ['Будапешт', 'Сараево', 'Ниш', 'Подгорица', 'Дебрецен', 'Арад', 'Сегед', 'Печ', 'Тузла', 'Кечкемет', 'Мостар', 'Суботица'],
				chosen: [],
			});
		expect((await citiesOnMap(page)).map((city) => city.name).slice(12)).toEqual(['Решица', 'Дробета-Турну-Северин', 'Осиек', 'Lukavac']);
	});

	test('scrolling to a card chooses its city: the card and the label are marked, and the map goes to it', async ({ page }) => {
		await scrollTo(page, 'Ниш');

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Ниш']);
		expect(await wentTo(page, NIS)).toBeLessThan(25);

		// Back to the first card: no city is chosen.
		await firstCard(page).evaluate((card) => {
			card.scrollIntoView({ inline: 'start', block: 'nearest' });
		});
		await expect(chosenCard(page)).toHaveCount(0);
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual([]);
	});

	// The card after the current one peeks out between it and the slider (#77), then fades out before the slider.
	test('tapping the card that peeks out chooses its city, and the map goes to it at the same zoom', async ({ page }) => {
		const zoom = await mapZoom(page);
		await expect(card(page, 'Будапешт')).not.toBeInViewport({ ratio: 0.9 });

		await tapCard(page, 'Будапешт');

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Будапешт');
		await expect(chosenCard(page)).toBeInViewport({ ratio: 0.9 });
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Будапешт']);
		expect(await wentTo(page, BUDAPEST)).toBeLessThan(25);
		expect(await mapZoom(page)).toBeCloseTo(zoom);
	});

	test("tapping the chosen city's card brings the map back to it, at the same zoom", async ({ page }) => {
		await scrollTo(page, 'Ниш');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		expect(await wentTo(page, NIS)).toBeLessThan(25);
		await dragMap(page, -150, -100);
		const zoom = await mapZoom(page);
		expect(await distanceFromTheMiddle(page, NIS)).toBeGreaterThan(100);

		await tapCard(page, 'Ниш');

		expect(await wentTo(page, NIS)).toBeLessThan(25);
		expect(await mapZoom(page)).toBeCloseTo(zoom);
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
	});

	test('tapping the current card chooses its city when another city is chosen, and the map goes to it', async ({ page }) => {
		await scrollTo(page, 'Ниш');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		// Reşiţa, the 13th, has no card: the list of all opens at it, and the carousel stays at Niš.
		await tapMap(page, { lat: 45.301, lon: 21.889 });
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(chosenCard(page)).toHaveCount(0);

		await tapCard(page, 'Ниш');

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Ниш']);
		expect(await wentTo(page, NIS)).toBeLessThan(25);
	});

	test('a tap on the slider over a card under it changes N and chooses no card', async ({ page }) => {
		const hourBox = await boxOf(sliderHour(page, 1));
		const tap = { x: hourBox.x + hourBox.width / 2, y: hourBox.y + hourBox.height / 2 };
		const under = await cityCards(page).evaluateAll(
			(cards, at) =>
				cards.some((card) => {
					const box = card.getBoundingClientRect();
					return box.left <= at.x && at.x <= box.right && box.top <= at.y && at.y <= box.bottom;
				}),
			tap,
		);
		expect(under, 'a card under the cell of 1 h').toBe(true);

		await page.mouse.click(tap.x, tap.y);

		await expect(slider(page)).toHaveAttribute('aria-valuenow', '1');
		await page.clock.fastForward(1000);
		await expect(chosenCard(page)).toHaveCount(0);
	});

	test('tapping «Маршрут» of a card opens the route, as before', async ({ page, network }) => {
		await scrollTo(page, 'Ниш');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');

		const route = page.waitForEvent('popup');
		await chosenCard(page).getByRole('link', { name: 'Маршрут' }).click();

		// A new tab asks Google Maps for the route; the fixtures cut that host off.
		await route;
		await expect
			.poll(() => network.blocked)
			.toContain('https://www.google.com/maps/dir/?api=1&origin=44.81760%2C20.45730&destination=43.325%2C21.903&travelmode=driving');
	});

	test('tapping «Маршрут» of the next card, not the chosen one, opens the route and leaves the carousel where it was', async ({
		page,
		network,
	}) => {
		await scrollTo(page, 'Ниш');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		const names = await cityCards(page).getByRole('heading').allInnerTexts();
		const next = cityCards(page)
			.nth(names.indexOf('Ниш') + 1)
			.getByRole('link', { name: 'Маршрут' });
		const href = await next.getAttribute('href');
		// Where the link is in the next card's part left in view: a click by locator would scroll the carousel to it.
		const link = await boxOf(next);

		const route = page.waitForEvent('popup');
		await page.mouse.click(link.x + 16, link.y + link.height / 2);

		await route;
		await expect.poll(() => network.blocked).toContain(href);
		await page.clock.fastForward(1000);
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
	});

	test('tapping a city of the carousel on the map scrolls the carousel to its card', async ({ page }) => {
		await tapMap(page, NIS);

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Ниш');
		await expect(chosenCard(page)).toBeInViewport({ ratio: 0.9 });
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual(['Ниш']);
	});

	test('tapping a city on the map that has no card opens the list of all, at that city', async ({ page }) => {
		// Reşiţa, the 13th.
		await tapMap(page, { lat: 45.301, lon: 21.889 });

		const sheet = page.getByRole('dialog', { name: '16 городов в кольце 2–3 ч' });
		await expect(sheet.locator('[aria-current="true"]')).toContainText('Решица');
		await expect(sheet.locator('[aria-current="true"]')).toBeInViewport();
	});

	test('a city picked in the list of all is chosen on the map, which goes to it', async ({ page }) => {
		await openTheList(page);

		await page.getByRole('dialog').getByTestId('city-row').filter({ hasText: 'Осиек' }).click();

		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect.poll(() => labelsOnMap(page)).toMatchObject({ chosen: ['Осиек'] });
		expect(await wentTo(page, { lat: 45.551, lon: 18.694 })).toBeLessThan(25);
		expect(await mapZoom(page)).toBeGreaterThanOrEqual(8);
		// 2 s on, past the camera's easing and any stop of the carousel, the city is still the chosen one, and named.
		expect(await labelsOnMap(page)).toMatchObject({ chosen: ['Осиек'], labels: expect.arrayContaining(['Осиек']) });
		await expect(chosenCard(page)).toHaveCount(0);
	});

	test('a city picked in the list of all that has a card is chosen in the carousel', async ({ page }) => {
		await openTheList(page);

		await page.getByRole('dialog').getByTestId('city-row').filter({ hasText: 'Тузла' }).click();

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Тузла');
		await expect(chosenCard(page)).toBeInViewport({ ratio: 0.9 });
		expect(await wentTo(page, { lat: 44.538, lon: 18.667 })).toBeLessThan(25);
	});

	test('a new ring chooses no city and shows the carousel from its start', async ({ page }) => {
		await scrollTo(page, 'Суботица');
		await expect(chosenCard(page).getByRole('heading')).toHaveText('Суботица');

		await slider(page).press('ArrowDown');

		await expectRingCard(page, '1–2 ч');
		await expect(firstCard(page)).toBeInViewport();
		await expect(chosenCard(page)).toHaveCount(0);
		await expect.poll(async () => (await labelsOnMap(page)).chosen).toEqual([]);
	});
});

/** The card of the city whose name is in its heading. */
const card = (page: Page, name: string) => cityCards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });

test.describe('a city card', () => {
	test('says the name, the local name, the country and the population, and leads to Google Maps from the origin', async ({
		page,
		ringApi,
	}) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);

		const budapest = card(page, 'Будапешт');
		await expect
			.poll(() => read(budapest))
			.toBe('Будапешт Budapest · Венгрия · 1,7 млн по визе Шенгена Российские номера не пустят Маршрут');
		const route = budapest.getByRole('link', { name: 'Маршрут' });
		await expect(route).toHaveAttribute(
			'href',
			'https://www.google.com/maps/dir/?api=1&origin=44.81760%2C20.45730&destination=47.498%2C19.04&travelmode=driving',
		);
		await expect(route).toHaveAttribute('target', '_blank');
		// A quiet link, not a button (#75): no button's look, no icon, the color and size of the card's facts, and still
		// a finger's tap.
		await expect(route).not.toHaveClass(/\bbtn\b/u);
		await expect(route).toHaveJSProperty('childElementCount', 0);
		const facts = budapest.getByText('Budapest · Венгрия · 1,7 млн');
		for (const property of ['color', 'font-size', 'background-color'] as const) {
			expect(await route.evaluate((link, name) => getComputedStyle(link).getPropertyValue(name), property), property).toBe(
				await facts.evaluate((line, name) => getComputedStyle(line).getPropertyValue(name), property),
			);
		}
		expect((await route.boundingBox())?.height).toBeGreaterThanOrEqual(40);
		// The start country; a city of 250 000 people is «250 тыс.».
		expect(await read(card(page, 'Ниш'))).toBe('Ниш Niš · Сербия · 250 тыс. страна старта Маршрут');
		// Without a visa, no mark.
		expect(await read(card(page, 'Сараево'))).toBe('Сараево Sarajevo · Босния и Герцеговина · 697 тыс. Маршрут');
	});

	test('of a city without a Russian name says its local name alone', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);

		expect(await read(card(page, 'Lukavac'))).toBe('Lukavac Босния и Герцеговина · 45 тыс. Маршрут');
	});

	test('marks the entry mode: an e-visa, a visa on arrival, a held visa of a country', async ({ page, ringApi }) => {
		// Not the visa rules of anyone: one mode for each country, to read the marks.
		ringApi.respond(() =>
			ringAroundBelgrade({
				SRB: { mode: 'start' },
				BIH: { mode: 'evisa', citizenship: 'RUS' },
				MNE: { mode: 'visa_on_arrival', citizenship: 'RUS' },
				HUN: { mode: 'held_visa', visa: 'GBR' },
			}),
		);
		await page.goto(LINK);

		await expect(card(page, 'Сараево')).toContainText('оформить заранее');
		await expect(card(page, 'Подгорица')).toContainText('виза на границе');
		await expect(card(page, 'Будапешт')).toContainText('по визе: Великобритания');
	});

	test('names the held visa chosen in «Мои визы» that opens its country, as the phrase does', async ({ page, ringApi }) => {
		// An Indian: the visa double opens Bosnia and Herzegovina and Montenegro by a US visa (rows of the visa
		// exemptions' table) and Hungary by a Schengen visa, and closes them without.
		ringApi.respond((call) => {
			const visas = call.visas?.split(',') ?? [];
			const byVisa = (visa: string) => (visas.includes(visa) ? ({ mode: 'held_visa', visa } as const) : ({ mode: 'closed' } as const));
			return ringAroundBelgrade({ ...RUSSIAN, BIH: byVisa('USA'), MNE: byVisa('USA'), HUN: byVisa('SCHENGEN') });
		});
		await page.goto(`${LINK}&cit=IND`);
		await expect(card(page, 'Ниш')).toContainText('страна старта');
		await expect(card(page, 'Сараево')).toHaveCount(0);

		const visasSheet = page.getByRole('dialog', { name: 'Мои визы' });
		await phrase(page).getByRole('button', { name: 'нет' }).click();
		await visasSheet.getByTestId('pick-item').filter({ hasText: /^США/u }).click();
		await visasSheet.getByRole('button', { name: 'Закрыть' }).click();

		await expect.poll(() => ringApi.calls.at(-1)?.visas).toBe('USA');
		await expect(card(page, 'Сараево')).toContainText('по визе: США');
		await expect(card(page, 'Подгорица')).toContainText('по визе: США');
		await expect(card(page, 'Будапешт')).toHaveCount(0);

		// The link carries both visas: Hungary's cities come by Schengen's.
		await page.goto(`${LINK}&cit=IND&visas=SCHENGEN,USA`);
		await expect(phrase(page)).toContainText('мои визы: Шенген, США');
		await expect(card(page, 'Будапешт')).toContainText('по визе Шенгена');
		await expect(card(page, 'Сараево')).toContainText('по визе: США');
	});

	test('warns of Russian plates in the EU only when a citizenship is Russian', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade({ ...WITH_SCHENGEN_VISA, HUN: { mode: 'visa_free', citizenship: 'SRB' } }));
		await page.goto(`${LINK}&cit=SRB`);

		await expect(card(page, 'Будапешт')).toBeVisible();
		await expect(cityCards(page).filter({ hasText: 'Российские номера не пустят' })).toHaveCount(0);

		await page.goto(`${LINK}&cit=RUS,SRB`);

		// Hungary, Romania and Croatia are in the EU; Serbia, Bosnia and Herzegovina and Montenegro are not.
		await expect(cityCards(page).filter({ hasText: 'Российские номера не пустят' }).getByRole('heading')).toHaveText([
			'Будапешт',
			'Дебрецен',
			'Арад',
			'Сегед',
			'Печ',
			'Кечкемет',
		]);
	});
});
