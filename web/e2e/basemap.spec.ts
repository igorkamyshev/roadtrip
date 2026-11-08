// The basemap (spec «Экран», «Карта»): Protomaps' vector tiles from our own domain, `/tiles/{z}/{x}/{y}`, the
// fonts and sprites from our static assets, the labels in Russian, else in the local language, and the
// attribution. The map is read by its style and the requests it made, never by pixels.
import type { Page } from '@playwright/test';
import type { StyleSpecification } from 'maplibre-gl';
import { expect, test } from './fixtures.ts';
import { OFFLINE } from './offline.ts';

/** The label of the spec: `coalesce(name:ru, name)`. */
const RUSSIAN_NAME = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

/** The map's style once it has loaded: its sprite, its fonts and the tiles of the view are in. */
async function loadedStyle(page: Page): Promise<StyleSpecification> {
	type MapForTests = { loaded(): boolean; getStyle(): StyleSpecification };
	await expect.poll(() => page.evaluate(() => (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap?.loaded() ?? false)).toBe(true);
	return page.evaluate(() => (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap.getStyle());
}

test('the basemap comes from our own domain and reaches no other host', async ({ page, network }) => {
	const assets: { url: string; status: number }[] = [];
	page.on('response', (response) => {
		if (new URL(response.url()).pathname.startsWith('/basemap/')) {
			assets.push({ url: response.url(), status: response.status() });
		}
	});
	await page.goto('/');

	const style = await loadedStyle(page);

	const origin = new URL(page.url()).origin;
	expect(network.tiles.length).toBeGreaterThan(0);
	for (const tile of network.tiles) {
		expect(tile.origin).toBe(origin);
		expect(tile.pathname).toMatch(/^\/tiles\/\d+\/\d+\/\d+$/u);
	}
	expect(network.blocked).toEqual([]);
	// The sprite came from our static assets.
	expect(assets.filter(({ url }) => url.includes('/basemap/sprites/')).length).toBeGreaterThan(0);
	expect(assets.filter(({ status }) => status !== 200)).toEqual([]);
	// Every font the labels use has its Cyrillic glyphs there.
	const fonts = new Set(JSON.stringify(style.layers).match(/Noto Sans [A-Za-z ]+?(?=")/gu));
	expect(fonts.size).toBeGreaterThan(0);
	for (const font of fonts) {
		const glyphs = await page.request.get(style.glyphs!.replace('{fontstack}', font).replace('{range}', '1024-1279'));
		expect(glyphs.status(), font).toBe(200);
		expect((await glyphs.body()).length, font).toBeGreaterThan(0);
	}
});

test('the labels are in Russian, else in the local language, on one line', async ({ page }) => {
	await page.goto('/');

	const style = await loadedStyle(page);

	const label = (id: string) => style.layers.find((layer) => layer.id === id)?.layout as Record<string, unknown> | undefined;
	// Cities and countries.
	expect(label('places_locality')?.['text-field']).toEqual(RUSSIAN_NAME);
	expect(label('places_country')?.['text-field']).toEqual(RUSSIAN_NAME);
	// No label anywhere takes another name: not the English one, not a second line in the local language.
	const names = new Set(JSON.stringify(style.layers.map((layer) => (layer.layout as Record<string, unknown> | undefined)?.['text-field'])).match(/"(pgf:)?name[^"]*"/gu));
	expect([...names].sort()).toEqual(['"name"', '"name:ru"']);
});

test('the map credits OpenStreetMap and Protomaps', async ({ page }) => {
	await page.goto('/');

	const attribution = page.locator('.maplibregl-ctrl-attrib-inner');
	await expect(attribution).toContainText('© OpenStreetMap');
	await expect(attribution).toContainText('Protomaps');
	await expect(attribution.locator('a', { hasText: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
});

test('the client keeps its map off window: it only announces it, and these tests listen', async ({ browser, baseURL }) => {
	// A context without the tests' listener, as a person's browser: the production build exposes nothing.
	const context = await browser.newContext({ baseURL, proxy: OFFLINE });
	const page = await context.newPage();
	await page.route(/^(?!http:\/\/localhost[:/])/u, (route) => route.abort('blockedbyclient'));
	await page.goto('/');

	await expect(page.locator('.maplibregl-canvas')).toBeVisible();
	expect(await page.evaluate(() => Object.keys(window).filter((key) => key.toLowerCase().includes('roadtrip')))).toEqual([]);
	await context.close();
});
