// The page's head (#70): Роадтрип's name and description, its mark as the tab's icon and on a phone's home screen, and
// the picture a messenger shows for a link.
import type { Page } from '@playwright/test';
import { expect, openInProduction, PRODUCTION, test } from './fixtures.ts';

test('the page is Роадтрип, and its description names visas, closed countries and the time at the border', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Роадтрип | Куда поехать на машине');
	await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Роадтрип');
	const description = page.locator('meta[name="description"]');
	await expect(description).toHaveAttribute('content', /виз/u);
	await expect(description).toHaveAttribute('content', /закрытых стран/u);
	await expect(description).toHaveAttribute('content', /времени на границе/u);
	await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
		'content',
		(await description.getAttribute('content')) ?? '',
	);
});

/**
 * An image the page loads from `url`: its size, and the colour of its pixel at `x`, `y` as `#rrggbb` once drawn
 * `drawn`×`drawn` (an SVG) or at its own size.
 */
async function imageAt(
	page: Page,
	url: string,
	{ x = 0, y = 0, drawn }: { readonly x?: number; readonly y?: number; readonly drawn?: number } = {},
): Promise<{ width: number; height: number; color: string }> {
	return page.evaluate(
		async ({ src, at, side }) => {
			const image = new Image();
			image.src = src;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = side ?? image.naturalWidth;
			canvas.height = side ?? image.naturalHeight;
			const context = canvas.getContext('2d');
			context?.drawImage(image, 0, 0, canvas.width, canvas.height);
			const [red = 0, green = 0, blue = 0] = context?.getImageData(at.x, at.y, 1, 1).data ?? [];
			const hex = [red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('');
			return { width: image.naturalWidth, height: image.naturalHeight, color: `#${hex}` };
		},
		{ src: url, at: { x, y }, side: drawn },
	);
}

/** The ring's blue of the light scheme (`--ring`), the square of the home screen's icon. */
const RING_BLUE = '#1b5fd6';

test('a phone puts the mark on a blue square on its home screen, under the name Роадтрип', async ({ page, request }) => {
	await page.goto('/');

	const touchIcon = (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '';
	expect(await imageAt(page, touchIcon)).toEqual({ width: 180, height: 180, color: RING_BLUE });

	const manifestUrl = (await page.locator('link[rel="manifest"]').getAttribute('href')) ?? '';
	const manifest = await request.get(manifestUrl);
	expect(manifest.status()).toBe(200);
	const icons = [
		{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
		{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
	];
	// Only the icon and its name: no app of its own on the home screen (#70, out of scope), so `display` is `browser`.
	expect(await manifest.json()).toMatchObject({ name: 'Роадтрип', short_name: 'Роадтрип', display: 'browser', icons });
	for (const { src, sizes } of icons) {
		const [width, height] = sizes.split('x').map(Number);
		expect(await imageAt(page, src)).toEqual({ width, height, color: RING_BLUE });
	}
});

test('the tab shows the mark, its origin red in the light scheme and in the dark one', async ({ page, request }) => {
	await page.goto('/');

	const svg = (await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href')) ?? '';
	// The origin's dot in the middle of the mark: `--start` of each scheme (src/styles.css).
	expect((await imageAt(page, svg, { x: 32, y: 32, drawn: 64 })).color).toBe('#e2412c');
	await page.emulateMedia({ colorScheme: 'dark' });
	expect((await imageAt(page, svg, { x: 32, y: 32, drawn: 64 })).color).toBe('#ff6a52');

	// For the browsers without SVG icons: 32 px, with 16 px in the same file.
	// The page cannot fetch a path that ends in favicon.ico under Playwright's routes, so the test does.
	const ico = await request.get((await page.locator('link[rel="icon"][sizes="32x32"]').getAttribute('href')) ?? '');
	expect(ico.status()).toBe(200);
	const data = `data:image/x-icon;base64,${(await ico.body()).toString('base64')}`;
	expect(await imageAt(page, data, { x: 16, y: 16 })).toEqual({ width: 32, height: 32, color: '#e2412c' });
});

test("a link to the site shows a picture of 1200×630 on the screen's background", async ({ page }) => {
	await openInProduction(page);

	const image = page.locator('meta[property="og:image"]');
	await expect(image).toHaveAttribute('content', `${PRODUCTION}/og.png`);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
	// `--bg` of the light scheme.
	expect(await imageAt(page, `${PRODUCTION}/og.png`)).toEqual({ width: 1200, height: 630, color: '#eef1ef' });
});
