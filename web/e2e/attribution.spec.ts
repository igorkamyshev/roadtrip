// The map's attribution (spec #20 «Экран», «Карта»): the data's sources live behind ⓘ «Что важно знать», and show under
// the phrase for 5 s once the screen opens, as OpenStreetMap's attribution guidelines want them seen.
import { expect, test } from './fixtures.ts';
import { phrase, sources } from './screen.ts';

/** Where the page's clock stands, held, while the screen opens. */
const START = Date.parse('2026-11-09T12:00:00Z');

test('the sources show under the phrase when the screen opens, then only behind ⓘ', async ({ page }) => {
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 1000);
	await page.goto('/');

	const osm = sources(page).getByRole('link', { name: 'OpenStreetMap' });
	await expect(osm).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
	for (const name of ['GeoNames', 'Protomaps', 'ESA WorldCover', 'Sherpa']) {
		await expect(sources(page).getByRole('link', { name })).toBeVisible();
	}
	await expect(sources(page).getByRole('link', { name: 'CC BY 4.0' })).toHaveCount(2);

	await page.clock.runFor(4900);
	await expect(osm).toBeVisible();
	await page.clock.runFor(100);
	// Hidden in its place, which stays (#77): no link to tap or to reach by keyboard.
	await expect(osm).toBeHidden();
	await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toHaveCount(0);

	await phrase(page).getByRole('button', { name: 'Что важно знать' }).click();
	const sheet = page.getByRole('dialog', { name: 'Что важно знать' });
	await expect(sheet.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
	await expect(sheet.getByRole('link', { name: 'Protomaps' })).toBeVisible();
});
