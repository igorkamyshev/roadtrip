// The places in the ring (spec #154 «Экран», spec #20 «Экран» with its amendments; stories 1–12, 18, 19, 21–27, 29 of
// #154): cities and places in one list by fame, in the carousel and in «Всё в кольце»; which places the ring holds,
// by their access points (GLOSSARY «Подъезд»); the card of a place; the first card; and the screen without the places
// file. The places are `PLACES` of the fixtures, real ones around Belgrade, with the cities of `CITIES`; a distance
// from the origin below is the larger of |Δlat| and |Δlon|, which is what decides whether `squareRing` holds a point.
//
// Fame (GLOSSARY «Известность»), worked by hand: a place's is its sitelinks × 1.5, a city's 0.7019 · population^0.3408.
// Balaton 97 → 145.5; Budapest 1 741 041 → 94.0; Hortobágy 54 → 81; Sarajevo 696 731 → 68.8; Studenica 44 → 66;
// Niš 250 000 → 48.5; Đerdap 32 → 48; Podgorica 236 852 → 47.6; Debrecen 202 402 → 45.1; Lepenski Vir and Vjetrenica
// 29 → 43.5, Lepenski Vir first by its smaller Q-id (Q906669, Q2880621); Arad 169 065 → 42.5; Szeged 160 766 → 41.7;
// Pécs → 40.3; Tuzla → 40.1; Manasija 25 → 37.5; Kecskemét → 36.7; Mostar → 36.0; Subotica → 35.5; Reşiţa → 33.1;
// Drobeta-Turnu Severin → 32.9; Osijek → 32.3; the lake of Zvornik 21 → 31.5; Lukavac → 26.9.
import type { Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { BELGRADE, carouselRing, expect, LINK_3_HOURS, OPEN_AROUND_SERBIA, servePlaces, squareRing, test, visaRules } from './fixtures.ts';
import {
	chosenCard,
	citiesOnMap,
	firstCard,
	holdTheClock,
	mapAtRest,
	moreCard,
	openTheList,
	placesOnMap,
	pointCard,
	pointCards,
	read,
	runUntil,
	runUntilMapAtRest,
	tapMap,
	wentTo,
} from './screen.ts';

/** A band from `inner` to `outer` degrees around Belgrade, with these entry modes. */
function bandAroundBelgrade(band: readonly [inner: number, outer: number], access: Access = OPEN_AROUND_SERBIA) {
	return { ...squareRing(BELGRADE.lat, BELGRADE.lon, band), ...visaRules(access) };
}

/** «Всё в кольце …», the list of all, open. */
const theList = (page: Page) => page.getByRole('dialog', { name: /^Всё в кольце/u });

/** The names of the list's rows on the page, in order. */
async function rowNames(page: Page): Promise<string[]> {
	return theList(page).getByTestId('row-name').allInnerTexts();
}

/** The names of the places the map marks as chosen. */
async function chosenOnMap(page: Page): Promise<string[]> {
	return (await placesOnMap(page)).filter((place) => place.chosen).map((place) => place.name);
}

/**
 * The colours a layer of the map gives one of its paint properties, those of its expression's cases, sorted: as the
 * overlay read them from the theme's tokens.
 */
async function coloursOf(page: Page, layer: string, property: string): Promise<string[]> {
	const paint = await page.evaluate(([id, name]) => window.mapForTests?.getPaintProperty(id, name), [layer, property]);
	const leaves = (value: unknown): unknown[] => (Array.isArray(value) ? value.flatMap((item) => leaves(item)) : [value]);
	return leaves(paint)
		.filter((leaf): leaf is string => typeof leaf === 'string' && /^(?:#|rgb|hsl)/u.test(leaf))
		.toSorted();
}

/** The value of a token of the page's theme (`--nature`), as its stylesheet writes it. */
async function themeToken(page: Page, name: string): Promise<string> {
	return page.evaluate((property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(), name);
}

/** Where a card's «Маршрут» leads: the destination of its link to Google Maps. */
async function routeTo(page: Page, name: string): Promise<string | null> {
	const href = await pointCard(page, name).getByRole('link', { name: 'Маршрут' }).getAttribute('href');
	return href === null ? null : new URL(href).searchParams.get('destination');
}

/** The colour the page's theme gives a token (`--nature`, `--history`), as the browser computes a colour. */
async function tokenColour(page: Page, token: string): Promise<string> {
	return page.evaluate((name) => {
		const probe = document.createElement('i');
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const colour = getComputedStyle(probe).color;
		probe.remove();
		return colour;
	}, token);
}

/** A card's strip on top: its width and colour. */
async function stripOf(page: Page, name: string): Promise<{ width: string; colour: string }> {
	return pointCard(page, name).evaluate((card) => {
		const style = getComputedStyle(card);
		return { width: style.borderTopWidth, colour: style.borderTopColor };
	});
}

test.describe('the carousel and «Всё в кольце»', () => {
	test('mix cities and places by fame: the 12 most famous cards, then «и ещё», and the list of all in the same order', async ({
		page,
		ringApi,
	}) => {
		// From 1° to 3°: 16 cities (cities.spec.ts) and 8 places, Balaton by Siófok (2.4°), Đerdap by Golubac (1.2°). Not
		// Deliblato Sands (0.6°) nor Krušedol (0.5°), in the ring's hole, nor Tara, whose access point is in it (0.96°).
		ringApi.respond(() => carouselRing());
		await page.goto(LINK_3_HOURS);

		// Hungary, Bosnia and Herzegovina, Serbia, Montenegro, Romania and Croatia.
		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 24 точки интереса в 6 странах Листайте → самое известное');
		await expect(pointCards(page).getByRole('heading')).toHaveText([
			'Балатон',
			'Будапешт',
			'Хортобадь',
			'Сараево',
			'Монастырь Студеница',
			'Ниш',
			'Джердап',
			'Подгорица',
			'Дебрецен',
			'Лепенски-Вир',
			'Vjetrenica',
			'Арад',
		]);
		expect(await read(moreCard(page))).toBe('и ещё 12 Всё в кольце →');

		await moreCard(page).click();
		await expect(theList(page)).toHaveAccessibleName('Всё в кольце 2–3 ч: 24');
		expect((await rowNames(page)).slice(0, 16)).toEqual([
			'Балатон',
			'Будапешт',
			'Хортобадь',
			'Сараево',
			'Монастырь Студеница',
			'Ниш',
			'Джердап',
			'Подгорица',
			'Дебрецен',
			'Лепенски-Вир',
			'Vjetrenica',
			'Арад',
			'Сегед',
			'Печ',
			'Тузла',
			'Монастырь Манасия',
		]);
		// A place's row: its name and flag, and under them the chip of its type; a city's, its population.
		const rows = theList(page).getByTestId('point-row');
		expect([await read(rows.nth(0)), await read(rows.nth(1))]).toEqual(['Балатон 🇭🇺 Озеро', 'Будапешт 🇭🇺 Население: 1,7 млн']);

		await theList(page)
			.getByTestId('sheet-body')
			.evaluate((body) => {
				body.scrollTop = body.scrollHeight;
			});
		await expect.poll(async () => (await rowNames(page)).slice(-3)).toEqual(['Осиек', 'Зворничко-езеро', 'Lukavac']);
	});

	test('wait for the places file: no card shows before it comes, so the carousel is not built anew', async ({ page, ringApi }) => {
		const { promise: places, resolve: release } = Promise.withResolvers<void>();
		await page.route('**/data/places.json', async (route) => {
			await places;
			await route.fallback();
		});
		const citiesCame = page.waitForResponse('**/data/cities.json');
		ringApi.respond(() => carouselRing());
		await holdTheClock(page);
		await page.goto(LINK_3_HOURS);
		await citiesCame;
		await runUntil(page, async () => (await firstCard(page).getAttribute('data-state')) === 'ring', 'the ring answered');
		await runUntilMapAtRest(page);

		// The cities and the ring are in, the places not: the first card has no count yet, and there are no cards.
		expect([await read(firstCard(page)), await pointCards(page).count()]).toEqual(['В кольце 2–3 ч', 0]);

		release();
		await runUntil(page, async () => (await pointCards(page).count()) === 12, 'the 12 cards');
		await expect(pointCards(page).getByRole('heading').first()).toHaveText('Балатон');
	});

	test('show the cities alone without the places file, and say nothing of it', async ({ page, ringApi }) => {
		await servePlaces(page, undefined);
		ringApi.respond(() => carouselRing());
		await page.goto(LINK_3_HOURS);

		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 16 точек интереса в 6 странах Листайте → самое известное');
		await expect(pointCards(page).getByRole('heading')).toHaveText([
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
		await expect(page.getByRole('alert')).toHaveCount(0);
	});
});

test.describe('a place chosen', () => {
	test.beforeEach(async ({ page, ringApi }) => {
		// oxlint-disable-next-line roadtrip/clock-through-screen -- a running clock, as cities.spec.ts's carousel and map: the tests wait on the page while it loads and scrolls, and jump the clock only past the map's easing and the carousel's stop
		await page.clock.install();
		ringApi.respond(() => carouselRing());
		await page.goto(LINK_3_HOURS);
		await expect(pointCards(page)).toHaveCount(12);
		await mapAtRest(page);
	});

	test('in the list of all, with a card, is chosen in the carousel, and the map goes to its access point', async ({ page }) => {
		await openTheList(page);
		await theList(page).getByTestId('point-row').filter({ hasText: 'Хортобадь' }).click();

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Хортобадь');
		expect(await wentTo(page, { lat: 47.583, lon: 21.151 })).toBeLessThan(25);
		expect(await chosenOnMap(page)).toEqual(['Хортобадь']);
	});

	test('in the list of all, with no card, is chosen with no card marked, and the map goes to its access point', async ({ page }) => {
		await openTheList(page);
		await theList(page).getByTestId('point-row').filter({ hasText: 'Монастырь Манасия' }).click();

		expect(await wentTo(page, { lat: 44.098, lon: 21.466 })).toBeLessThan(25);
		await expect(chosenCard(page)).toHaveCount(0);
		// Marked on the map, and named there though it has no card.
		expect((await placesOnMap(page)).filter((place) => place.chosen)).toMatchObject([{ name: 'Монастырь Манасия', label: true }]);
	});

	test('by scrolling the carousel to its card, marked on the map, and the map goes to its access point', async ({ page }) => {
		// Đerdap's own point is at the Iron Gates, 0.84° east of its access point at Golubac, where the map goes.
		await pointCard(page, 'Джердап').evaluate((element) => {
			element.scrollIntoView({ inline: 'start', block: 'nearest' });
		});

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Джердап');
		await expect.poll(() => chosenOnMap(page)).toEqual(['Джердап']);
		expect(await wentTo(page, { lat: 44.664, lon: 21.676 })).toBeLessThan(25);

		// Back to the first card: no place is chosen.
		await firstCard(page).evaluate((card) => {
			card.scrollIntoView({ inline: 'start', block: 'nearest' });
		});
		await expect.poll(() => chosenOnMap(page)).toEqual([]);
	});

	test('by a tap on its diamond, with a card: the carousel comes to its card', async ({ page }) => {
		await tapMap(page, { lat: 43.486, lon: 20.533 });

		await expect(chosenCard(page).getByRole('heading')).toHaveText('Монастырь Студеница');
		await expect(chosenCard(page)).toBeInViewport({ ratio: 0.9 });
		await expect.poll(() => chosenOnMap(page)).toEqual(['Монастырь Студеница']);
	});

	test('by a tap on its diamond, with no card: the list of all opens at it', async ({ page }) => {
		await tapMap(page, { lat: 44.098, lon: 21.466 });

		const current = theList(page).locator('[aria-current="true"]');
		await expect(current).toContainText('Монастырь Манасия');
		await expect(current).toBeInViewport();
	});
});

test.describe('the map', () => {
	test("puts a diamond of its group at each place's access point, named for the places with a card, smaller and unnamed for the others", async ({
		page,
		ringApi,
	}) => {
		// From 1° to 3°: the 8 places of the ring among its 24 points of interest, all of them among the 250 first. Six
		// have a card; Manasija is the 16th, the lake of Zvornik the 23rd. Đerdap stands at Golubac and the lake of
		// Zvornik in Bosnia and Herzegovina, their access points in the ring nearest Belgrade.
		ringApi.respond(() => carouselRing());
		await page.goto(LINK_3_HOURS);
		await expect(pointCards(page)).toHaveCount(12);

		await expect
			.poll(() => placesOnMap(page))
			.toEqual([
				{ name: 'Балатон', at: [18.058, 46.905], group: 'nature', label: true, chosen: false },
				{ name: 'Хортобадь', at: [21.151, 47.583], group: 'nature', label: true, chosen: false },
				{ name: 'Монастырь Студеница', at: [20.533, 43.486], group: 'history', label: true, chosen: false },
				{ name: 'Джердап', at: [21.676, 44.664], group: 'nature', label: true, chosen: false },
				{ name: 'Лепенски-Вир', at: [22.026, 44.557], group: 'history', label: true, chosen: false },
				{ name: 'Vjetrenica', at: [17.985, 42.847], group: 'nature', label: true, chosen: false },
				{ name: 'Монастырь Манасия', at: [21.466, 44.098], group: 'history', label: false, chosen: false },
				{ name: 'Зворничко-езеро', at: [19.112, 44.38], group: 'nature', label: false, chosen: false },
			]);
		// The cities' dots and names are the cities' alone.
		expect((await citiesOnMap(page)).map((city) => city.name)).toEqual([
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
			'Решица',
			'Дробета-Турну-Северин',
			'Осиек',
			'Lukavac',
		]);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`colours the diamonds and the names by the theme's tokens: the group's, and the origin's for the chosen diamond (${colorScheme})`, async ({
			page,
			ringApi,
		}) => {
			await page.emulateMedia({ colorScheme });
			ringApi.respond(() => carouselRing());
			await page.goto(LINK_3_HOURS);
			await expect.poll(async () => (await placesOnMap(page)).length).toBe(8);

			const [nature, history, start] = [
				await themeToken(page, '--nature'),
				await themeToken(page, '--history'),
				await themeToken(page, '--start'),
			];
			expect(await coloursOf(page, 'place-diamonds', 'icon-color')).toEqual([nature, history, start].toSorted());
			expect(await coloursOf(page, 'place-labels', 'text-color')).toEqual([nature, history].toSorted());
			expect([
				await coloursOf(page, 'place-diamonds', 'icon-halo-color'),
				await coloursOf(page, 'place-labels', 'text-halo-color'),
			]).toEqual([[await themeToken(page, '--halo')], [await themeToken(page, '--halo')]]);
		});
	}
});

test.describe('a place in the ring', () => {
	test('is there by an access point at its edge, a large place whose own point is outside', async ({ page, ringApi }) => {
		// From 1° to 2.6°: Balaton's own point is 2.74° away, its access point at Siófok 2.40°, at Keszthely 3.21°.
		ringApi.respond(() => bandAroundBelgrade([1, 2.6]));
		await page.goto(LINK_3_HOURS);

		await expect(pointCards(page).getByRole('heading').first()).toHaveText('Балатон');
		expect(await routeTo(page, 'Балатон')).toBe('46.905,18.058');
	});

	test('is not there when none of its access points is, though its own point is', async ({ page, ringApi }) => {
		// From 0.95° to 2.6°: Tara's own point is 0.998° away, its access point 0.96°. Its 33 would put it between
		// Reşiţa (33.1) and Drobeta-Turnu Severin (32.9).
		ringApi.respond(() => bandAroundBelgrade([0.95, 2.6]));
		await page.goto(LINK_3_HOURS);
		await expect(pointCards(page)).toHaveCount(12);

		await moreCard(page).click();
		await theList(page)
			.getByTestId('sheet-body')
			.evaluate((body) => {
				body.scrollTop = body.scrollHeight;
			});
		await expect
			.poll(async () => (await rowNames(page)).slice(-5))
			.toEqual(['Решица', 'Дробета-Турну-Северин', 'Осиек', 'Зворничко-езеро', 'Lukavac']);
	});

	// From 1.2° to 1.5°: the lake of Zvornik, its access point in Bosnia and Herzegovina 117 km from Belgrade (1.35°), in
	// Serbia 119 km (1.29°). The card's flag and «Маршрут» are the access point's.
	for (const { title, access, card, to } of [
		{
			title: 'at the border is there by an access point in an open country, in a closed one beside it',
			access: { ...OPEN_AROUND_SERBIA, BIH: { mode: 'closed' } } satisfies Access,
			card: 'Зворничко-езеро 🇷🇸 Озеро Маршрут',
			to: '44.27,19.163',
		},
		{
			title: 'stands at its access point in the ring nearest the origin',
			access: OPEN_AROUND_SERBIA,
			card: 'Зворничко-езеро 🇧🇦 Озеро Маршрут',
			to: '44.38,19.112',
		},
	]) {
		test(title, async ({ page, ringApi }) => {
			ringApi.respond(() => bandAroundBelgrade([1.2, 1.5], access));
			await page.goto(LINK_3_HOURS);

			await expect.poll(() => read(pointCard(page, 'Зворничко-езеро'))).toBe(card);
			expect(await routeTo(page, 'Зворничко-езеро')).toBe(to);
		});
	}
});

test.describe('the card of a place', () => {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`has the chip of its type, the strip of its group, the flag of its access point's country, and leads to that point (${colorScheme})`, async ({
			page,
			ringApi,
		}) => {
			await page.emulateMedia({ colorScheme });
			ringApi.respond(() => carouselRing());
			await page.goto(LINK_3_HOURS);

			await expect
				.poll(async () =>
					Promise.all(['Балатон', 'Хортобадь', 'Монастырь Студеница', 'Лепенски-Вир'].map(async (name) => read(pointCard(page, name)))),
				)
				.toEqual([
					'Балатон 🇭🇺 Озеро Маршрут',
					'Хортобадь 🇭🇺 Нацпарк Маршрут',
					'Монастырь Студеница 🇷🇸 Монастырь Маршрут',
					'Лепенски-Вир 🇷🇸 Руины Маршрут',
				]);
			await expect(pointCard(page, 'Балатон').getByRole('img', { name: 'Венгрия' })).toHaveAttribute('title', 'Венгрия');
			expect(await routeTo(page, 'Балатон')).toBe('46.905,18.058');
			expect(await routeTo(page, 'Монастырь Студеница')).toBe('43.486,20.533');

			// Nature green, history terracotta: the theme's tokens, two colours in either scheme; a city has no strip.
			const [nature, history] = [await tokenColour(page, '--nature'), await tokenColour(page, '--history')];
			expect(nature).not.toBe(history);
			expect([
				(await stripOf(page, 'Балатон')).colour,
				(await stripOf(page, 'Хортобадь')).colour,
				(await stripOf(page, 'Монастырь Студеница')).colour,
				(await stripOf(page, 'Лепенски-Вир')).colour,
				(await stripOf(page, 'Будапешт')).width,
			]).toEqual([nature, nature, history, history, '0px']);
		});
	}

	test('the themes give the groups colours of their own', async ({ page }) => {
		const tokens = async () =>
			page.evaluate(() => {
				const style = getComputedStyle(document.documentElement);
				return [style.getPropertyValue('--nature').trim(), style.getPropertyValue('--history').trim()];
			});
		await page.goto('/');
		const light = await tokens();
		await page.emulateMedia({ colorScheme: 'dark' });
		const dark = await tokens();
		expect([...light, ...dark].every((value) => value !== '')).toBe(true);
		expect(dark[0]).not.toBe(light[0]);
		expect(dark[1]).not.toBe(light[1]);
	});

	test('of a place with no Russian name says its other name', async ({ page, ringApi }) => {
		ringApi.respond(() => carouselRing());
		await page.goto(LINK_3_HOURS);

		await expect.poll(() => read(pointCard(page, 'Vjetrenica'))).toBe('Vjetrenica 🇧🇦 Пещера Маршрут');
	});
});

test.describe('the first card', () => {
	test('says «Точек интереса в кольце нет» for a ring with neither cities nor places', async ({ page, ringApi }) => {
		// From 0.02° to 0.1°: Belgrade, 0.01°, is in the hole, Pančevo, 0.18°, and every place outside.
		ringApi.respond(() => bandAroundBelgrade([0.02, 0.1]));
		await page.goto(LINK_3_HOURS);

		await expect(firstCard(page)).toHaveAttribute('data-state', 'no_points');
		expect(await read(firstCard(page))).toBe('Точек интереса в кольце нет Показываем города от 15 000 жителей и известные места.');
		await expect(pointCards(page)).toHaveCount(0);
	});

	test('counts the places of a ring with no city, and the carousel shows them', async ({ page, ringApi }) => {
		// From 0° to 0.25° around the Iron Gates: Lepenski Vir (0.04°) and Đerdap by Donji Milanovac (0.16°), not by
		// Golubac (0.32°) nor Tekija (0.41°); Drobeta-Turnu Severin is 0.65° away.
		ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), [0, 0.25]), ...visaRules() }));
		await page.goto('/#/?p=44.60000,22.00000&h=3');

		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 2 точки интереса в 1 стране Листайте → самое известное');
		await expect(pointCards(page).getByRole('heading')).toHaveText(['Джердап', 'Лепенски-Вир']);
		expect(await routeTo(page, 'Джердап')).toBe('44.618,22.163');
	});
});
