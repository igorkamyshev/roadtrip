// The first card by state (spec «Экран», «Первая карточка, по состояниям»; stories 7, 9, 21, 47, 48): the
// engine's outcomes without a ring, the WAF's block and failures, with the spec's texts and buttons.
import type { RingResponse } from 'worker/api';
import { allowGeolocation, expect, squareRing, test, visaRules, type RingReply } from './fixtures.ts';
import { firstCard, ringOnMap } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };
/** A link to Belgrade with N = 5. */
const LINK = '/#/?p=44.81760,20.45730&h=5';

const outcomes: readonly { outcome: string; answer: RingResponse; texts: readonly string[]; buttons: readonly string[] }[] = [
	{
		outcome: 'empty',
		answer: { outcome: 'empty', maxHours: 3, startCountry: 'SRB', source: 'calculation', ...visaRules() },
		texts: ['Дальше 3 ч не уехать', 'Дальше море или закрытые страны. Добавьте свои визы или уменьшите время.'],
		buttons: [],
	},
	{
		outcome: 'no_roads',
		answer: { outcome: 'no_roads', startCountry: 'SRB', source: 'cache', ...visaRules() },
		texts: ['Рядом нет дорог', 'Точка дальше 50 км от дороги. Выберите другую.'],
		buttons: ['На карте'],
	},
	{
		outcome: 'no_ring',
		answer: { outcome: 'no_ring', startCountry: 'UKR', source: 'cache', ...visaRules() },
		texts: ['Кольца нет', 'Отсюда посчитать не можем: эта страна или территория закрыта для всех.'],
		buttons: ['На карте'],
	},
];

for (const { outcome, answer, texts, buttons } of outcomes) {
	test(`${outcome}: the first card says so, and no ring is drawn`, async ({ page, ringApi }) => {
		ringApi.respond(() => answer);
		await page.goto(LINK);

		for (const text of texts) {
			await expect(firstCard(page)).toContainText(text);
		}
		expect(await firstCard(page).getByRole('button').allInnerTexts()).toEqual(buttons);
		expect(await ringOnMap(page)).toEqual([]);
	});
}

test('«На карте» of a card without a ring turns the pin mode on', async ({ page, ringApi }) => {
	ringApi.respond(() => ({ outcome: 'no_roads', startCountry: 'SRB', source: 'cache', ...visaRules() }));
	await page.goto(LINK);

	await firstCard(page).getByRole('button', { name: 'На карте' }).click();

	await expect(page.getByText('Двигайте карту, чтобы поставить точку под булавку')).toBeVisible();
});

const failures: readonly { failure: string; reply: RingReply; texts: readonly string[] }[] = [
	{ failure: '429 from the WAF', reply: { status: 429 }, texts: ['Слишком много запросов, подождите несколько секунд'] },
	{ failure: '5xx', reply: { status: 502 }, texts: ['Не получилось посчитать', 'Проверьте интернет и попробуйте ещё раз.'] },
	{ failure: 'a network failure', reply: 'network error', texts: ['Не получилось посчитать', 'Проверьте интернет и попробуйте ещё раз.'] },
];

for (const { failure, reply, texts } of failures) {
	test(`${failure}: the first card says so, and «Повторить» asks again`, async ({ page, context, ringApi }) => {
		await allowGeolocation(context, BELGRADE);
		ringApi.respond(() => reply);
		await page.goto('/');

		for (const text of texts) {
			await expect(firstCard(page)).toContainText(text);
		}
		// Nothing repeats the request by itself.
		await page.waitForTimeout(500);
		expect(ringApi.calls).toHaveLength(1);

		ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));
		await firstCard(page).getByRole('button', { name: 'Повторить' }).click();

		await expect(firstCard(page)).toContainText('В кольце до 1 ч');
		expect(ringApi.calls).toHaveLength(2);
		expect(ringApi.calls[1]).toEqual(ringApi.calls[0]);
	});
}
