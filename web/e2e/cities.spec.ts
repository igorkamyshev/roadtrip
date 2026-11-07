// The cities in the ring (spec «Экран»: «Города в кольце», «Карусель», «Карточка города», the first card «нет
// городов»; stories 35–42): which cities the screen picks of the cities file, the carousel, the list of all cities,
// the cards, and how the carousel and the map follow each other. The cities are `CITIES` of the fixtures, real ones
// around Belgrade, or a test's own; their distance from Belgrade below is the larger of |Δlat| and |Δlon|, which is
// what decides whether `squareRing` holds them.
import type { Locator, Page } from '@playwright/test';
import type { Access } from 'worker/api';
import { allowGeolocation, expect, serveCities, squareRing, test, visaRules } from './fixtures.ts';
import { firstCard } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=3';

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
	return { ...squareRing(BELGRADE.lat, BELGRADE.lon, 1, 3), ...visaRules(access) };
}

/** What a person reads in an element: its inner text with the line breaks as spaces. */
async function read(locator: Locator): Promise<string> {
	return (await locator.innerText()).replace(/\s+/gu, ' ').trim();
}

test.beforeEach(async ({ context }) => {
	await allowGeolocation(context, BELGRADE);
});

test.describe('the first card', () => {
	test('counts the cities in the ring whose countries are open, and their countries', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);

		// From 1° to 3°, in Serbia, Bosnia and Herzegovina and Montenegro: Sarajevo 2.1°, Niš 1.5°, Podgorica 2.4°,
		// Tuzla 1.8°, Mostar 2.6°, Subotica 1.3°, Ilidža 2.2°. Not Belgrade, 0.01°, in the ring's hole, nor
		// Kragujevac, 0.8°, nor Budapest, 2.7°, in Hungary, closed, nor Pristina, 2.1°, in Kosovo, closed for everyone.
		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 7 городов в 3 странах Листайте → самые крупные');
	});
});

test.describe('the carousel', () => {
	test('shows the 12 biggest cities after the first card, and «и ещё K» opens the list of all', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);

		// 16 cities from 1° to 3°, all but Pristina's Kosovo open: the 12 biggest, then 4 more.
		await expect.poll(() => read(firstCard(page))).toBe('В кольце 2–3 ч 16 городов в 6 странах Листайте → самые крупные');
		await expect(cityCards(page).locator('h3')).toHaveText([
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

test.describe('the list of all cities', () => {
	const sheet = (page: Page) => page.getByRole('dialog', { name: /в кольце/u });
	const rows = (page: Page) => sheet(page).getByTestId('city-row');

	test('lists every city of the ring, biggest first, with its country, population and entry mode', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);
		await page.getByRole('button', { name: /и ещё/u }).click();

		await expect(rows(page)).toHaveCount(16);
		expect(await Promise.all((await rows(page).all()).slice(0, 3).map(read))).toEqual([
			'Будапешт Budapest Венгрия · 1,7 млн по визе Шенгена',
			'Сараево Sarajevo Босния и Герцеговина · 697 тыс.',
			'Ниш Niš Сербия · 250 тыс. страна старта',
		]);
		expect(await read(rows(page).last())).toBe('Ilidža Босния и Герцеговина · 71 тыс.');

		await sheet(page).getByRole('button', { name: 'Закрыть' }).click();
		await expect(sheet(page)).toHaveCount(0);
	});

	test('keeps only the rows in view on the page, for the thousands of cities of a long ring', async ({ page, ringApi }) => {
		// 3 000 cities in Serbia between 1.5° and 2.5° from Belgrade, the n-th of 100 000 − n people.
		await serveCities(
			page,
			Array.from({ length: 3000 }, (_, n) => [n + 1, `Город ${n + 1}`, `Grad ${n + 1}`, BELGRADE.lat + 1.5 + (n % 100) / 100, BELGRADE.lon - 1 + Math.floor(n / 100) / 15, 100_000 - n, 'SRB'] as const),
		);
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);
		await expect.poll(() => read(firstCard(page))).toContain('3000 городов в 1 стране');
		await page.getByRole('button', { name: /и ещё/u }).click();

		await expect(rows(page).first()).toContainText('Город 1');
		expect(await rows(page).count()).toBeLessThan(50);

		await sheet(page).locator('.sheet-body').evaluate((body) => {
			body.scrollTop = body.scrollHeight;
		});

		await expect(rows(page).last()).toContainText('Город 3000');
		expect(await rows(page).count()).toBeLessThan(50);
	});
});

test.describe('a city card', () => {
	/** The card of the city whose name is in its heading. */
	const card = (page: Page, name: string) => cityCards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });

	test('says the name, the local name, the country and the population, and leads to Google Maps from the origin', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(WITH_SCHENGEN_VISA));
		await page.goto(LINK);

		const budapest = card(page, 'Будапешт');
		await expect.poll(() => read(budapest)).toBe('Будапешт Budapest · Венгрия · 1,7 млн по визе Шенгена Российские номера не пустят Маршрут');
		await expect(budapest.getByRole('link', { name: 'Маршрут' })).toHaveAttribute(
			'href',
			'https://www.google.com/maps/dir/?api=1&origin=44.81760%2C20.45730&destination=47.498%2C19.04&travelmode=driving',
		);
		await expect(budapest.getByRole('link', { name: 'Маршрут' })).toHaveAttribute('target', '_blank');
		// The start country; a city of 250 000 people is «250 тыс.».
		expect(await read(card(page, 'Ниш'))).toBe('Ниш Niš · Сербия · 250 тыс. страна старта Маршрут');
		// Without a visa, no mark.
		expect(await read(card(page, 'Сараево'))).toBe('Сараево Sarajevo · Босния и Герцеговина · 697 тыс. Маршрут');
	});

	test('of a city without a Russian name says its local name alone', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade(RUSSIAN));
		await page.goto(LINK);

		expect(await read(card(page, 'Ilidža'))).toBe('Ilidža Босния и Герцеговина · 71 тыс. Маршрут');
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

	test('warns of Russian plates in the EU only when a citizenship is Russian', async ({ page, ringApi }) => {
		ringApi.respond(() => ringAroundBelgrade({ ...WITH_SCHENGEN_VISA, HUN: { mode: 'visa_free', citizenship: 'SRB' } }));
		await page.goto(`${LINK}&cit=SRB`);

		await expect(card(page, 'Будапешт')).toBeVisible();
		await expect(cityCards(page).filter({ hasText: 'Российские номера не пустят' })).toHaveCount(0);

		await page.goto(`${LINK}&cit=RUS,SRB`);

		// Hungary, Romania and Croatia are in the EU; Serbia, Bosnia and Herzegovina and Montenegro are not.
		await expect(cityCards(page).filter({ hasText: 'Российские номера не пустят' }).locator('h3')).toHaveText([
			'Будапешт',
			'Дебрецен',
			'Арад',
			'Сегед',
			'Печ',
			'Кечкемет',
		]);
	});
});
