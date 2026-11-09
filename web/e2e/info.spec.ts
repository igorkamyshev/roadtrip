// ⓘ in the phrase (spec #20 «Экран», «ⓘ «Что важно знать»»; story 46): plates, the visa data's accuracy, Google
// Maps' routes, the travel-time formula and the data's sources.
import { expect, test } from './fixtures.ts';
import { phrase } from './screen.ts';

test('ⓘ tells what is important to know, with the sources of the data', async ({ page }) => {
	await page.goto('/');

	await phrase(page).getByRole('button', { name: 'Что важно знать' }).click();

	const sheet = page.getByRole('dialog', { name: 'Что важно знать' });
	for (const text of [
		'В страны ЕС не пускают машины с российскими номерами. Если едете на такой машине, страны ЕС в кольце вам не подходят.',
		'Визовые правила — по данным Sherpa и нашей таблицы исключений. Они меняются: перед поездкой проверьте правила въезда. Условия вроде многократной или уже использованной визы мы не проверяем.',
		'Маршрут строят Google Карты. Они не знают, какие страны для вас закрыты, и могут повести через них. За их маршрут мы не отвечаем.',
		'Время в пути — время за рулём ×1,2 и по 1,5 ч на каждой границе с паспортным контролем.',
		'Источники данных: OpenStreetMap, GeoNames (CC BY 4.0, с изменениями), Protomaps, ESA WorldCover (CC BY 4.0), Sherpa.',
	]) {
		await expect(sheet).toContainText(text);
	}
	// The licence of GeoNames, then of ESA WorldCover.
	const licences = sheet.getByRole('link', { name: 'CC BY 4.0' });
	await expect(licences).toHaveCount(2);
	for (const licence of await licences.all()) {
		await expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
	}
	await expect(sheet.getByRole('link', { name: 'GeoNames' })).toHaveAttribute('href', 'https://www.geonames.org/');
	await expect(sheet.getByRole('link', { name: 'ESA WorldCover' })).toHaveAttribute('href', 'https://esa-worldcover.org/');

	await sheet.getByRole('button', { name: 'Закрыть' }).click();
	await expect(sheet).toHaveCount(0);
});
