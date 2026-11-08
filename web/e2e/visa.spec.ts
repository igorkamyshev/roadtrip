// Citizenships and the visa rules on the screen (spec «Экран»: the phrase, the sheet «Гражданство», the hatching,
// «визовые правила от», the card `visa_rules_missing`; «Состояние, ссылка и память браузера»; stories on
// citizenships): what the person sees and what the screen asks the API.
import type { Page } from '@playwright/test';
import { allowGeolocation, expect, squareRing, test, visaRules, ZONE_OUTLINES } from './fixtures.ts';
import { dottedHours, expectRingCard, firstCard, hatchedZones, outlinesOnMap, phrase, ringOnMap, slider } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
const LINK = '/#/?p=44.81760,20.45730&h=2';

test.beforeEach(async ({ context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), (call.hours - 1) / 10, call.hours / 10));
});

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Гражданство' });
const choice = (page: Page, name: string) => sheet(page).getByRole('button', { name });

/** A new load of the page, as after closing the tab: the browser's storage stays. */
async function reopen(page: Page, path: string): Promise<void> {
	await page.goto('about:blank');
	await page.goto(path);
}

test.describe('the citizenships', () => {
	test('are Russian by default: «Гражданство РФ» in the phrase, in the request and in the link', async ({ page, ringApi }) => {
		await page.goto('/');

		await expect(phrase(page)).toContainText('в пути. Гражданство РФ');
		const [call] = await ringApi.waitForCalls(1);
		expect(call.cit).toBe('RUS');
		await expect(page).toHaveURL(/#\/\?p=44\.81760,20\.45730&h=1&cit=RUS$/u);
	});

	test('are chosen in their sheet: several, at least one, Russian first and by default', async ({ page, ringApi }) => {
		await page.goto(LINK);
		await expectRingCard(page, '1–2 ч');

		await phrase(page).getByRole('button', { name: 'РФ' }).click();

		await expect(sheet(page)).toContainText('Можно несколько: для каждой страны берём самый удобный вариант въезда.');
		const first = sheet(page).locator('.pick-item').first();
		await expect(first).toHaveText('Россия по умолчанию');
		await expect(first).toHaveAttribute('aria-pressed', 'true');

		await choice(page, 'Сербия').click();
		await expect(choice(page, 'Сербия')).toHaveAttribute('aria-pressed', 'true');
		await expect(phrase(page)).toContainText('Гражданство РФ + Сербия');
		await expect.poll(() => ringApi.calls.at(-1)?.cit).toBe('RUS,SRB');
		await expect(page).toHaveURL(/&cit=RUS,SRB$/u);

		await choice(page, 'Россия').click();
		await expect(phrase(page)).toContainText('Гражданство Сербия');
		await expect.poll(() => ringApi.calls.at(-1)?.cit).toBe('SRB');

		// The last one stays.
		const calls = ringApi.calls.length;
		await choice(page, 'Сербия').click();
		await expect(choice(page, 'Сербия')).toHaveAttribute('aria-pressed', 'true');
		await expect(phrase(page)).toContainText('Гражданство Сербия');
		expect(ringApi.calls).toHaveLength(calls);

		await sheet(page).getByRole('button', { name: 'Закрыть' }).click();
		await expect(sheet(page)).toBeHidden();
		await expectRingCard(page, '1–2 ч');
	});

	test("are Sherpa's passports, filtered by name, in Russian", async ({ page }) => {
		await page.goto(LINK);
		await phrase(page).getByRole('button', { name: 'РФ' }).click();
		const filter = sheet(page).getByRole('searchbox', { name: 'Найти гражданство' });
		const names = () => sheet(page).locator('.pick-item').allInnerTexts();

		expect(await sheet(page).locator('.pick-item').count()).toBe(199);
		await filter.fill('корея');
		// North Korea's passport is not Sherpa's.
		expect(await names()).toEqual(['Республика Корея']);
		await filter.fill('КОСОВО');
		expect(await names()).toEqual(['Косово']);
		await filter.fill('Сент');
		expect(await names()).toEqual(['Сент-Винсент и Гренадины', 'Сент-Китс и Невис', 'Сент-Люсия']);
		await filter.fill('Атлантида');
		expect(await names()).toEqual([]);
		// Neither the spec nor the prototype has a line for an empty filter.
		await expect(sheet(page)).not.toContainText('нет в списке');
		await filter.fill('');
		expect(await sheet(page).locator('.pick-item').count()).toBe(199);
	});

	test('in a link open with it, sorted, and are saved', async ({ page, ringApi }) => {
		await page.goto(`${LINK}&cit=SRB,DEU`);

		await expect(phrase(page)).toContainText('Гражданство Германия + Сербия');
		await expect(page).toHaveURL(/&h=2&cit=DEU,SRB$/u);
		expect((await ringApi.waitForCalls(1))[0].cit).toBe('DEU,SRB');

		await reopen(page, '/');
		await expect(page).toHaveURL(/&h=2&cit=DEU,SRB$/u);
		await expect(phrase(page)).toContainText('Гражданство Германия + Сербия');
	});

	for (const cit of ['PRK', 'RUS,XXX', 'rus', '']) {
		test(`that are not Sherpa's passports in a link take the default: cit=${cit}`, async ({ page, ringApi }) => {
			await page.goto(`${LINK}&cit=${cit}`);

			await expect(page).toHaveURL(/&h=2&cit=RUS$/u);
			expect((await ringApi.waitForCalls(1))[0].cit).toBe('RUS');
		});
	}
});

test.describe('the hatching', () => {
	test('covers the closed countries and territories by access, over the zone outlines', async ({ page, ringApi }) => {
		ringApi.respond((call) => ({
			...squareRing(Number(call.lat), Number(call.lon), 0, call.hours / 10),
			...visaRules({
				SRB: { mode: 'start' },
				BIH: { mode: 'visa_free', citizenship: 'RUS' },
				HUN: { mode: 'closed' },
				UKR: { mode: 'closed', closedForEveryone: true },
				CRIMEA: { mode: 'closed', closedForEveryone: true },
				ALB: { mode: 'evisa', citizenship: 'RUS' },
			}),
		}));
		await page.goto(LINK);

		await expect.poll(() => hatchedZones(page)).toEqual(['CRIMEA', 'HUN', 'UKR']);
		await expect.poll(() => outlinesOnMap(page)).toEqual(ZONE_OUTLINES.features.map((feature) => feature.properties.zone));
	});

	test('follows the answer shown, and is gone without visa rules', async ({ page, ringApi }) => {
		ringApi.respond((call) =>
			call.cit === 'RUS'
				? { ...squareRing(Number(call.lat), Number(call.lon), 0, 0.1), ...visaRules({ HUN: { mode: 'closed' } }) }
				: { outcome: 'visa_rules_missing', missingCitizenship: 'SRB' },
		);
		await page.goto(LINK);
		await expect.poll(() => hatchedZones(page)).toEqual(['HUN']);

		await phrase(page).getByRole('button', { name: 'РФ' }).click();
		await choice(page, 'Сербия').click();

		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила');
		await expect.poll(() => hatchedZones(page)).toEqual([]);
	});
});

test.describe('the visa rules', () => {
	test.beforeEach(async ({ page }) => {
		await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
	});

	test('older than two days are dated under the phrase', async ({ page, ringApi }) => {
		ringApi.respond((call) => ({
			...squareRing(Number(call.lat), Number(call.lon), 0, call.hours / 10),
			...visaRules(undefined, call.hours === 2 ? '2026-11-05T11:59:00Z' : '2026-11-05T12:01:00Z'),
		}));
		await page.goto(LINK);

		await expect(phrase(page)).toContainText('визовые правила от 5 ноября');
		await slider(page).press('ArrowUp');
		await expectRingCard(page, '2–3 ч');
		await expect(phrase(page)).not.toContainText('визовые правила');
	});

	test('of another year are dated with the year', async ({ page, ringApi }) => {
		ringApi.respond((call) => ({ ...squareRing(Number(call.lat), Number(call.lon), 0, 0.1), ...visaRules(undefined, '2025-12-30T09:00:00Z') }));
		await page.goto(LINK);

		await expect(phrase(page)).toContainText('визовые правила от 30 декабря 2025');
	});

	test('missing for a citizenship: no ring, the card says which, and «Гражданство» opens its sheet', async ({ page, ringApi }) => {
		ringApi.respond(() => ({ outcome: 'visa_rules_missing', missingCitizenship: 'SRB' }));
		await page.goto(`${LINK}&cit=RUS,SRB`);

		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила для гражданства Сербия.');
		await expect(firstCard(page)).toContainText('Попробуйте позже или уберите это гражданство');
		expect(await firstCard(page).getByRole('button').allInnerTexts()).toEqual(['Гражданство']);
		expect(await ringOnMap(page)).toEqual([]);

		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.2));
		await firstCard(page).getByRole('button', { name: 'Гражданство' }).click();
		await choice(page, 'Сербия').click();

		await expectRingCard(page, '1–2 ч');
		expect(ringApi.calls.at(-1)?.cit).toBe('RUS');
	});

	test('missing are not kept: those hours get no dot, and asking for them again asks the Worker again', async ({ page, ringApi }) => {
		ringApi.respond((call) =>
			call.cit === 'RUS,SRB' && call.hours === 2
				? { outcome: 'visa_rules_missing', missingCitizenship: 'SRB' }
				: squareRing(Number(call.lat), Number(call.lon), (call.hours - 1) / 10, call.hours / 10),
		);
		await page.goto(`${LINK}&cit=RUS,SRB`);
		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила для гражданства Сербия.');

		// Another N, then back: a request each time, and a dot only for the ring.
		await slider(page).press('ArrowUp');
		// The ring of 2–3 h, 0.2°–0.3° around Belgrade, has none of the test's cities.
		await expect(firstCard(page)).toContainText('Городов в кольце нет');
		expect(await dottedHours(page)).toEqual([3]);
		await slider(page).press('ArrowDown');
		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила для гражданства Сербия.');
		expect(await dottedHours(page)).toEqual([3]);
		expect(ringApi.calls.map((call) => [call.cit, call.hours])).toEqual([
			['RUS,SRB', 2],
			['RUS,SRB', 3],
			['RUS,SRB', 2],
		]);

		// Without the citizenship and with it again: a request again.
		await firstCard(page).getByRole('button', { name: 'Гражданство' }).click();
		await choice(page, 'Сербия').click();
		await expectRingCard(page, '1–2 ч');
		await choice(page, 'Сербия').click();
		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила для гражданства Сербия.');
		expect(ringApi.calls.map((call) => [call.cit, call.hours]).slice(3)).toEqual([
			['RUS', 2],
			['RUS,SRB', 2],
		]);
	});

	test('missing for the Russian citizenship says «РФ», as the phrase does', async ({ page, ringApi }) => {
		ringApi.respond(() => ({ outcome: 'visa_rules_missing', missingCitizenship: 'RUS' }));
		await page.goto(LINK);

		await expect(firstCard(page)).toContainText('Не удалось загрузить визовые правила для гражданства РФ.');
	});
});
