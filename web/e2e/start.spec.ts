// The origin (spec «Экран»: phrase, pin; stories 1, 3, 4, 6): geolocation on the first visit, the screen without
// it, the pin mode, and the marker where the person put it.
import { allowGeolocation, expect, squareRing, test } from './fixtures.ts';
import { firstCard, phrase, ringOnMap, startOnMap } from './screen.ts';

const BELGRADE = { lat: 44.8176, lon: 20.4573 };

test('on the first visit the ring comes for where the person is, N = 1', async ({ page, context, ringApi }) => {
	await allowGeolocation(context, BELGRADE);
	ringApi.respond((call) => squareRing(Number(call.lat), Number(call.lon), 0, 0.5));

	await page.goto('/');

	const [call] = await ringApi.waitForCalls(1);
	expect(call).toMatchObject({ lat: '44.81760', lon: '20.45730', hours: 1, cit: 'RUS', visas: null });
	await expect(phrase(page)).toContainText('Из точки на карте, до 1 часа в пути.');
	await expect(firstCard(page)).toContainText('В кольце до 1 ч');
	await expect.poll(() => ringOnMap(page)).toEqual([squareRing(BELGRADE.lat, BELGRADE.lon, 0, 0.5).ring]);
	expect(await startOnMap(page)).toEqual([BELGRADE.lon, BELGRADE.lat]);
	expect(ringApi.calls).toHaveLength(1);
});
