// The held visas on the screen (spec «Экран»: the phrase, the sheet «Мои визы», the card `empty`; «Состояние,
// ссылка и память браузера»; stories 21, 25–27): what the person sees, what the screen asks the API, and the link.
//
// The counters come from the visa exemptions' table the client bundles (rules' VISA_EXEMPTIONS), on the date
// `page.clock` sets: the tests below name the countries each count is made of, so a change of the table that
// changes a count changes them too.
import type { Page } from '@playwright/test';
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { expectRingCard, firstCard, phrase } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=2';

test.beforeEach(async ({ context, page, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), (call.hours - 1) / 10, call.hours / 10));
});

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Мои визы' });

/** A new load of the page, as after closing the tab: the browser's storage stays. */
async function reopen(page: Page, path: string): Promise<void> {
	await page.goto('about:blank');
	await page.goto(path);
}

test.describe('the held visas', () => {
	test('are none by default: «мои визы: нет» in the phrase, none in the request and the link', async ({ page, ringApi }) => {
		await page.goto('/');

		await expect(phrase(page)).toContainText('в пути. Гражданство РФ, мои визы: нет');
		const [call] = await ringApi.waitForCalls(1);
		expect(call.visas).toBeNull();
		await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS$/u);
	});
});

test.describe('the sheet «Мои визы»', () => {
	const section = (page: Page, name: string) => sheet(page).getByRole('region', { name });
	/** A choice of the sheet by its name, without the counter under it. */
	const choice = (page: Page, name: string) =>
		sheet(page)
			.locator('.pick-item')
			.filter({ has: page.locator('.pick-name', { hasText: new RegExp(`^${name}$`, 'u') }) });
	const subOf = (page: Page, name: string) => choice(page, name).locator('.pick-sub');

	test('lists Schengen and the visas that open other countries, with what each opens today, then the visa of one country', async ({
		page,
	}) => {
		await page.goto(LINK);
		await phrase(page).getByRole('button', { name: 'нет' }).click();

		await expect(sheet(page)).toContainText('Визы и ВНЖ, которые у вас уже есть.');
		const four = section(page, 'Шенген и визы, которые открывают другие страны');
		await expect(four.locator('.pick-name')).toHaveText(['Шенген', 'США', 'Великобритания', 'Канада']);
		// For a Russian on 2026-11-07. Schengen: ALB, AND, MKD, MNE, SRB, BIH, CYP, GEO, MAR, MEX, BLZ, PAN. The USA: ALB,
		// MKD, MNE, SRB, BIH, GEO, MAR, MEX, BLZ, PAN. The UK: ALB, MKD, MNE, SRB, GEO, MAR, MEX, PAN. Canada: MKD, MNE,
		// GEO, MAR, MEX, BLZ, PAN. The rows for some citizenships only (MDA, ARM, CRI, COL, PER, ARG, IRL, TWN, PHL)
		// are not for Russians.
		await expect(four.locator('.pick-sub')).toHaveText([
			'Открывает весь Шенген и ещё 12 стран, например Черногорию и Сербию',
			'Открывает ещё 10 стран',
			'Открывает ещё 8 стран',
			'Открывает ещё 7 стран',
		]);

		const one = section(page, 'Виза одной страны');
		const names = await one.locator('.pick-name').allInnerTexts();
		expect(names).toEqual(expect.arrayContaining(['Грузия', 'Андорра', 'Кипр', 'Ирландия', 'Турция', 'Китай']));
		// Schengen's countries are held only as Schengen, and the four are above.
		for (const held of ['Германия', 'Монако', 'Гибралтар', 'США', 'Соединенные Штаты', 'Великобритания', 'Канада']) {
			expect(names).not.toContain(held);
		}
		// Every country: ISO 3166-1's 249, Kosovo and Northern Cyprus, but the 33 in Schengen and the USA, the UK and Canada.
		expect(names).toHaveLength(249 + 2 - 33 - 3);
		expect(names).toEqual(expect.arrayContaining(['Гренландия', 'Северный Кипр', 'КНДР']));
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'ru')));
	});

	test('counts only the rows acting today: none after its last day, and those for the citizenships chosen', async ({ page }) => {
		// MKD's rows for the USA, the UK and Canada end on 2026-12-31.
		await page.clock.setSystemTime(new Date('2027-01-01T00:00:00Z'));
		await page.goto(LINK);
		await phrase(page).getByRole('button', { name: 'нет' }).click();

		await expect(sheet(page).locator('.pick-sub')).toHaveText([
			'Открывает весь Шенген и ещё 12 стран, например Черногорию и Сербию',
			'Открывает ещё 9 стран',
			'Открывает ещё 7 стран',
			'Открывает ещё 6 стран',
		]);

		await reopen(page, `${LINK}&cit=IND`);
		await phrase(page).getByRole('button', { name: 'нет' }).click();
		// For an Indian, the rows for some citizenships too: MDA, CYP, ARM, CRI, COL, PER, TWN, PHL.
		await expect(subOf(page, 'Шенген')).toHaveText('Открывает весь Шенген и ещё 19 стран, например Черногорию и Сербию');
	});

	test('filters the visas of one country by name', async ({ page }) => {
		await page.goto(LINK);
		await phrase(page).getByRole('button', { name: 'нет' }).click();
		const one = section(page, 'Виза одной страны');
		const filter = one.getByRole('searchbox', { name: 'Найти страну' });

		await filter.fill('ГРУЗ');
		await expect(one.locator('.pick-name')).toHaveText(['Грузия']);
		await filter.fill('сент');
		await expect(one.locator('.pick-name')).toHaveText(['Сент-Винсент и Гренадины', 'Сент-Китс и Невис', 'Сент-Люсия']);
		await filter.fill('Германия');
		await expect(one.locator('.pick-name')).toHaveCount(0);
		await expect(one).not.toContainText('нет в списке');
		// The first section stays as it is.
		await expect(section(page, 'Шенген и визы, которые открывают другие страны').locator('.pick-name')).toHaveCount(4);
	});

	test('chooses visas: each change is in the phrase, the request and the link, and none is fine', async ({ page, ringApi }) => {
		await page.goto(LINK);
		await phrase(page).getByRole('button', { name: 'нет' }).click();

		await choice(page, 'Шенген').click();
		await expect(choice(page, 'Шенген')).toHaveAttribute('aria-pressed', 'true');
		await expect(phrase(page)).toContainText('мои визы: Шенген');
		await expect.poll(() => ringApi.calls.at(-1)?.visas).toBe('SCHENGEN');
		await expect(page).toHaveURL(/&cit=RUS&visas=SCHENGEN$/u);

		await section(page, 'Виза одной страны').getByRole('searchbox', { name: 'Найти страну' }).fill('груз');
		await choice(page, 'Грузия').click();
		await choice(page, 'США').click();
		await expect(phrase(page)).toContainText('мои визы: Шенген, США, Грузия');
		await expect.poll(() => ringApi.calls.at(-1)?.visas).toBe('GEO,SCHENGEN,USA');
		await expect(page).toHaveURL(/&cit=RUS&visas=GEO,SCHENGEN,USA$/u);

		for (const name of ['Шенген', 'США', 'Грузия']) {
			await choice(page, name).click();
		}
		await expect(phrase(page)).toContainText('мои визы: нет');
		await expect(page).toHaveURL(/&cit=RUS$/u);
		// A request per change; without visas the first ring comes back from memory, with no request.
		await expect
			.poll(() => ringApi.calls.map((call) => call.visas))
			.toEqual([null, 'SCHENGEN', 'GEO,SCHENGEN', 'GEO,SCHENGEN,USA', 'GEO,USA', 'GEO']);
		await expectRingCard(page, '1–2 ч');

		await sheet(page).getByRole('button', { name: 'Закрыть' }).click();
		await expect(sheet(page)).toBeHidden();
	});
});

test('«Мои визы» of the card `empty` opens the sheet, and a visa chosen there asks for its ring', async ({ page, ringApi }) => {
	ringApi.respond((call) =>
		call.visas === null
			? {
					outcome: 'empty',
					maxHours: 1,
					startCountry: 'SRB',
					source: 'calculation',
					access: {},
					visaRulesLoadedAt: new Date().toISOString(),
				}
			: squareRing(Number(call.lat), Number(call.lon), 0.1, 0.2),
	);
	await page.goto(LINK);
	await expect(firstCard(page)).toContainText('Дальше 1 ч не уехать');

	await firstCard(page).getByRole('button', { name: 'Мои визы' }).click();
	await sheet(page)
		.locator('.pick-item')
		.filter({ hasText: /^Шенген/u })
		.click();

	await expectRingCard(page, '1–2 ч');
	expect(ringApi.calls.at(-1)?.visas).toBe('SCHENGEN');
});

test.describe('the held visas of a link', () => {
	test('open with it, sorted, are saved, and show as chosen', async ({ page, ringApi }) => {
		await page.goto(`${LINK}&visas=SCHENGEN,GEO`);

		await expect(phrase(page)).toContainText('мои визы: Шенген, Грузия');
		await expect(page).toHaveURL(/&h=2&cit=RUS&visas=GEO,SCHENGEN$/u);
		expect((await ringApi.waitForCalls(1))[0].visas).toBe('GEO,SCHENGEN');

		await reopen(page, '/');
		await expect(page).toHaveURL(/&h=2&cit=RUS&visas=GEO,SCHENGEN$/u);
		await expect(phrase(page)).toContainText('мои визы: Шенген, Грузия');
		await phrase(page).getByRole('button', { name: 'Шенген, Грузия' }).click();
		await expect(sheet(page).locator('.pick-item[aria-pressed="true"] .pick-name')).toHaveText(['Шенген', 'Грузия']);
	});

	test('without visas has none, though some were saved: the link wins', async ({ page, ringApi }) => {
		await page.goto(`${LINK}&visas=USA`);
		await expect(phrase(page)).toContainText('мои визы: США');

		await reopen(page, LINK);

		await expect(phrase(page)).toContainText('мои визы: нет');
		await expect(page).toHaveURL(/&h=2&cit=RUS$/u);
		await expect.poll(() => ringApi.calls.map((call) => call.visas)).toEqual(['USA', null]);
	});

	for (const visas of ['DEU', 'SCHENGEN,XXX', 'schengen', '']) {
		test(`that are not held visas take the default, none: visas=${visas}`, async ({ page, ringApi }) => {
			await page.goto(`${LINK}&visas=${visas}`);

			await expect(page).toHaveURL(/&h=2&cit=RUS$/u);
			expect((await ringApi.waitForCalls(1))[0].visas).toBeNull();
			await expect(phrase(page)).toContainText('мои визы: нет');
		});
	}

	test('alone carries a state: the saved one does not open', async ({ page, ringApi }) => {
		await page.goto(`/#/?p=43.85630,18.41310&h=4`);
		await expectRingCard(page, '3–4 ч');

		await reopen(page, '/#/?visas=SCHENGEN');

		await expect(phrase(page)).toContainText('мои визы: Шенген');
		await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS&visas=SCHENGEN$/u);
		expect(ringApi.calls.at(-1)).toMatchObject({ lat: '44.81760', hours: 1, visas: 'SCHENGEN' });
	});
});
