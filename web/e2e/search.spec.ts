// The sheet «Откуда едем» and the origin's label (spec «Экран»: the phrase, the sheet, the first card's table;
// stories 2, 4, 5): the city search by the start of the Russian or local name (src/cities/search.ts), the origin's
// city (src/cities/nearest.ts, GLOSSARY «Город точки старта»), «Указать на карте» and «Где я», «Город»
// on the first card, and the label of each way to set the origin. The cities are `CITIES` of the fixtures, real ones
// around Belgrade.
import type { Page } from '@playwright/test';
import type { RingResponse } from 'worker/api';
import { allowGeolocation, CITIES, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import { expectRingCard, firstCard, phrase, reopen } from './screen.ts';

const startSheet = (page: Page) => page.getByRole('dialog', { name: 'Откуда едем' });

/** Opens «Откуда едем» from the phrase's start token (`label`) and types `text` into the search. */
async function search(page: Page, label: string, text: string): Promise<void> {
	await phrase(page).getByRole('button', { name: label }).click();
	await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill(text);
}

/** The cities the search shows, as their rows read: name, local name, country and population. */
const found = (page: Page) => startSheet(page).getByTestId('found-city');

test.beforeEach(({ ringApi }) => {
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), [0, 0.5]));
});

test.describe('the search', () => {
	test('a city found by the start of its Russian name becomes the origin, and the phrase names it', async ({ page, ringApi }) => {
		await page.goto('/');
		await search(page, 'выберите', 'бел');
		await startSheet(page)
			.getByRole('button', { name: /^Белград/u })
			.click();

		const [call] = await ringApi.waitForCalls(1);
		expect(call).toMatchObject({ lat: '44.80400', lon: '20.46500', hours: 1 });
		await expect(startSheet(page)).toHaveCount(0);
		await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
		await expect(page).toHaveURL(/#\/\?p=44\.80400,20\.46500&h=1&cit=RUS$/u);
	});

	test('finds a city by the start of its local name, in any case, and says its country and population', async ({ page }) => {
		await page.goto('/');
		await search(page, 'выберите', 'SZEG');

		await expect(found(page)).toHaveText(['Сегед Szeged Венгрия · 161 тыс.'], { useInnerText: true });
	});

	test('takes ё for е and е for ё', async ({ page }) => {
		await serveCities(page, [...CITIES, [515012, 'Орёл', 'Orel', 52.965, 36.078, 303_169, 'RUS']]);
		await page.goto('/');

		await search(page, 'выберите', 'орел');
		await expect(found(page)).toHaveText([/^Орёл/u]);
		await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill('сёгед');
		await expect(found(page)).toHaveText([/^Сегед/u]);
	});

	test('finds only the names that start with the text, bigger cities higher: not by a later word, nor by the middle of one', async ({
		page,
	}) => {
		await page.goto('/');
		await search(page, 'выберите', 'с');
		await expect(found(page).locator('.row-name')).toHaveText(['Сараево', 'Сегед', 'Суботица', 'Смедерево']);

		for (const text of ['сад', 'Sad', 'град', 'grade']) {
			await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill(text);
			await expect(found(page)).toHaveCount(0);
		}
	});

	test('takes a space for a hyphen and a hyphen for a space', async ({ page }) => {
		await page.goto('/');
		await search(page, 'выберите', 'нови с');
		await expect(found(page).locator('.row-name')).toHaveText(['Нови-Сад']);

		await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill('novi-s');
		await expect(found(page).locator('.row-name')).toHaveText(['Нови-Сад']);
		await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill('дробета турну');
		await expect(found(page).locator('.row-name')).toHaveText(['Дробета-Турну-Северин']);
	});

	test('shows the 8 biggest at most', async ({ page }) => {
		const cities = Array.from(
			{ length: 10 },
			(_, index) => [9000 + index, `Сити ${index}`, `City ${index}`, 44.8, 20.4 + index / 100, 20_000 + index * 1000, 'SRB'] as const,
		);
		await serveCities(page, cities);
		await page.goto('/');
		await search(page, 'выберите', 'сити');

		await expect(found(page).locator('.row-name')).toHaveText([
			'Сити 9',
			'Сити 8',
			'Сити 7',
			'Сити 6',
			'Сити 5',
			'Сити 4',
			'Сити 3',
			'Сити 2',
		]);
	});

	test('says when the list has no such city', async ({ page }) => {
		await page.goto('/');
		await search(page, 'выберите', 'Лондон');

		await expect(found(page)).toHaveCount(0);
		await expect(startSheet(page)).toContainText('Такого города нет в списке. В нём города от 15 000 жителей.');
	});
});

test.describe('the sheet «Откуда едем»', () => {
	test('«Указать на карте» turns the pin mode on', async ({ page }) => {
		await page.goto('/');
		await phrase(page).getByRole('button', { name: 'выберите' }).click();

		await startSheet(page).getByRole('button', { name: 'Указать на карте' }).click();

		await expect(startSheet(page)).toHaveCount(0);
		await expect(page.getByText('Двигайте карту, чтобы поставить точку под булавку')).toBeVisible();
	});

	test('«Где я» says under the buttons when the browser gives no position', async ({ page }) => {
		// A link: the screen does not ask where the person is until «Где я».
		await page.goto('/#/?p=44.80400,20.46500&h=1');
		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await expect(startSheet(page)).not.toContainText('Браузер не дал доступ к геолокации.');

		await startSheet(page).getByRole('button', { name: 'Где я' }).click();

		await expect(startSheet(page).locator('.chips + p')).toHaveText('Браузер не дал доступ к геолокации.');
		await expect(phrase(page)).toContainText('Из точки Белград,');
	});

	test("«Где я» sets the origin where the person is, and the phrase names the origin's city", async ({ page, context, ringApi }) => {
		await page.goto('/');
		await phrase(page).getByRole('button', { name: 'выберите' }).click();
		// In Pančevo, 1.2 km from its point, within its limits of 2.5 km; Belgrade is 15 km away.
		await allowGeolocation(context, { lat: 44.865, lon: 20.63 });

		await startSheet(page).getByRole('button', { name: 'Где я' }).click();

		const [call] = await ringApi.waitForCalls(1);
		expect(call).toMatchObject({ lat: '44.86500', lon: '20.63000' });
		await expect(startSheet(page)).toHaveCount(0);
		await expect(phrase(page)).toContainText('Из точки Панчево, до 1 часа в пути.');
	});
});

test.describe('«Город» on the first card', () => {
	test('opens «Откуда едем» from «Откуда едем?», before «На карте» and «Где я»', async ({ page }) => {
		await page.goto('/');

		await expect(firstCard(page).getByRole('button')).toHaveText(['Город', 'На карте', '']);
		await firstCard(page).getByRole('button', { name: 'Город' }).click();

		await expect(startSheet(page).getByRole('searchbox', { name: 'Найти город' })).toBeFocused();
	});

	const withoutRing: readonly { outcome: string; answer: RingResponse }[] = [
		{ outcome: 'no_roads', answer: { outcome: 'no_roads', startCountry: 'SRB', source: 'cache', ...visaRules() } },
		{ outcome: 'no_ring', answer: { outcome: 'no_ring', startCountry: 'UKR', source: 'cache', ...visaRules() } },
	];
	for (const { outcome, answer } of withoutRing) {
		test(`opens «Откуда едем» from the card of ${outcome}, and a city found there is the new origin`, async ({ page, ringApi }) => {
			ringApi.respond((call) => (call.lat === '44.80400' ? squareRing(44.804, 20.465, [0, 0.5]) : answer));
			await page.goto('/#/?p=45.50000,22.50000&h=1');
			await expect(firstCard(page).getByRole('button', { name: 'Город' })).toBeVisible();

			await firstCard(page).getByRole('button', { name: 'Город' }).click();
			await startSheet(page).getByRole('searchbox', { name: 'Найти город' }).fill('Белград');
			await startSheet(page)
				.getByRole('button', { name: /^Белград/u })
				.click();

			await expectRingCard(page, 'до 1 ч');
			await expect(phrase(page)).toContainText('Из точки Белград, до 1 часа в пути.');
		});
	}
});

test.describe("the origin's label", () => {
	test('is «на карте» for the pin', async ({ page }) => {
		await page.goto('/#/?p=44.80400,20.46500&h=1');
		await expect(phrase(page)).toContainText('Из точки Белград,');

		await phrase(page).getByRole('button', { name: 'Белград' }).click();
		await startSheet(page).getByRole('button', { name: 'Указать на карте' }).click();
		await page.getByRole('button', { name: 'Старт здесь' }).click();

		await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
	});

	test("is the origin's city on the first visit, by geolocation", async ({ page, context }) => {
		// Novi Sad is 2.2 km away, within its limits of 4.2 km.
		await allowGeolocation(context, { lat: 45.24, lon: 19.86 });
		await page.goto('/');

		await expect(phrase(page)).toContainText('Из точки Нови-Сад, до 1 часа в пути.');
	});

	test('is «на карте» by geolocation outside the limits of every city, and for the saved state then', async ({
		page,
		context,
		ringApi,
	}) => {
		// 11.6 km from Belgrade, outside its limits of 10 km.
		await allowGeolocation(context, { lat: 44.7, lon: 20.45 });
		await page.goto('/');
		await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');

		await reopen(page, ringApi, '/');

		await expect(page).toHaveURL(/#\/\?p=44\.70000,20\.45000&h=1&cit=RUS$/u);
		await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
	});

	test("is the origin's city in kilometres, not degrees: far north a degree of longitude is short", async ({ page }) => {
		// At 69° N the city 0.3° east is 12 km away (111 km × cos 69° × 0.3), the one 0.15° north 17 km; both are
		// within the 18 km of the limits of 4 million people.
		await serveCities(page, [
			[1, 'Север', 'Sever', 69.15, 33, 4_000_000, 'RUS'],
			[2, 'Восток', 'Vostok', 69, 33.3, 4_000_000, 'RUS'],
		]);
		await page.goto('/#/?p=69.00000,33.00000&h=1');

		await expect(phrase(page)).toContainText('Из точки Восток, до 1 часа в пути.');
	});

	test("is the origin's city across the antimeridian", async ({ page }) => {
		// From 179.9° E: 179.95° W is 0.15° away (16 km), 178.5° E is 1.4° (149 km); the limits of 4 million people
		// are 18 km.
		await serveCities(page, [
			[1, 'Восток', 'Vostok', -16.8, 178.5, 4_000_000, 'FJI'],
			[2, 'Запад', 'Zapad', -16.8, -179.95, 4_000_000, 'FJI'],
		]);
		await page.goto('/#/?p=-16.80000,179.90000&h=1');

		await expect(phrase(page)).toContainText('Из точки Запад, до 1 часа в пути.');
	});

	test("is the origin's city for a link", async ({ page }) => {
		// Niš is 3 km away, within its limits of 4.5 km.
		await page.goto('/#/?p=43.30000,21.90000&h=1');

		await expect(phrase(page)).toContainText('Из точки Ниш, до 1 часа в пути.');
	});

	test("is the origin's city for the saved state, a city of the search included", async ({ page, ringApi }) => {
		await page.goto('/#/?p=43.30000,21.90000&h=1');
		await expect(phrase(page)).toContainText('Из точки Ниш,');
		await search(page, 'Ниш', 'Luka');
		await startSheet(page)
			.getByRole('button', { name: /^Lukavac/u })
			.click();
		await expect(phrase(page)).toContainText('Из точки Lukavac,');

		await reopen(page, ringApi, '/');

		await expect(page).toHaveURL(/#\/\?p=44\.54200,18\.52600&h=1&cit=RUS$/u);
		await expect(phrase(page)).toContainText('Из точки Lukavac, до 1 часа в пути.');
	});

	test("is the origin's city of a link the person puts into the open page", async ({ page }) => {
		await page.goto('/#/?p=44.80400,20.46500&h=1');
		await search(page, 'Белград', 'Сараево');
		await startSheet(page)
			.getByRole('button', { name: /^Сараево/u })
			.click();
		await expect(phrase(page)).toContainText('Из точки Сараево,');

		await page.evaluate(() => {
			window.location.hash = '#/?p=43.30000,21.90000&h=1&cit=RUS';
		});

		await expect(phrase(page)).toContainText('Из точки Ниш, до 1 часа в пути.');
	});

	test('is «на карте» when the cities file cannot be had', async ({ page }) => {
		await page.route('**/data/cities.json', (route) => route.fulfill({ status: 404 }));
		await page.goto('/#/?p=43.30000,21.90000&h=1');

		await expectRingCard(page, 'до 1 ч');
		await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
	});
});
