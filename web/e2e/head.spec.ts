// The page's head (#70): Роадтрип's name and description, its mark as the tab's icon and on a phone's home screen, and
// the picture a messenger shows for a link. The icons are images, so these tests read their pixels: a corner for the
// square under the mark, the middle for the origin's red dot.
import type { Page } from '@playwright/test';
import { expect, openInProduction, PRODUCTION, test } from './fixtures.ts';

/** #70's description, which names the visas, the closed countries and the time at the border. */
const DESCRIPTION =
	'Роадтрип показывает на карте, куда доехать на машине за N часов или дней с учётом виз и ВНЖ, закрытых стран и территорий, пунктов пропуска и времени на границе';

/** The light scheme's `--ring`, the square of the home screen's icon. */
const RING_BLUE = '#1b5fd6';
/** `--start` of the light scheme and of the dark one, the origin's dot in the middle of the mark. */
const START_RED = '#e2412c';
const START_RED_DARK = '#ff6a52';
/** The light scheme's `--bg`, the link's picture's background. */
const BACKGROUND = '#eef1ef';

/** The head's metadata: each `meta` by its `name` or `property`, and each `link` by its `rel`, `type` and `sizes`. */
interface Head {
	readonly meta: Readonly<Record<string, string>>;
	readonly links: readonly { readonly rel: string; readonly href: string; readonly type: string; readonly sizes: string }[];
}

/**
 * The page's head, read at once: it has no roles or text on the screen for a locator to find, so the test reads it as
 * a browser or a messenger does.
 */
async function headOf(page: Page): Promise<Head> {
	return page.evaluate(() => ({
		meta: Object.fromEntries(
			Array.from(document.head.querySelectorAll('meta')).map((meta) => [
				meta.name === '' ? (meta.getAttribute('property') ?? '') : meta.name,
				meta.content,
			]),
		),
		links: Array.from(document.head.querySelectorAll('link')).map((link) => ({
			rel: link.rel,
			href: link.getAttribute('href') ?? '',
			type: link.type,
			sizes: link.sizes.value,
		})),
	}));
}

/** The `href` of the head's one link of `rel`, and of `type` and `sizes` when given; the test fails without it. */
function hrefIn(head: Head, wanted: { readonly rel: string; readonly type?: string; readonly sizes?: string }): string {
	const matching = head.links.filter(
		(link) =>
			link.rel === wanted.rel &&
			(wanted.type === undefined || link.type === wanted.type) &&
			(wanted.sizes === undefined || link.sizes === wanted.sizes),
	);
	expect(matching, `one link ${JSON.stringify(wanted)}`).toHaveLength(1);
	return matching[0]?.href ?? '';
}

/**
 * An image the page loads from `url`: its size, and the colours (`#rrggbb`) of its pixels at `points`, once drawn
 * `drawn`×`drawn` (an SVG) or at its own size; and whether any of its pixels is `find`.
 */
async function readImage(
	page: Page,
	url: string,
	{
		points = [],
		drawn,
		find = '',
	}: { readonly points?: readonly (readonly [number, number])[]; readonly drawn?: number; readonly find?: string },
): Promise<{ width: number; height: number; colors: string[]; found: boolean }> {
	return page.evaluate(
		async ({ src, at, side, wanted }) => {
			const image = new Image();
			image.src = src;
			await image.decode();
			const canvas = document.createElement('canvas');
			canvas.width = side ?? image.naturalWidth;
			canvas.height = side ?? image.naturalHeight;
			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('no 2d context');
			}
			context.drawImage(image, 0, 0, canvas.width, canvas.height);
			const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
			const hexAt = (offset: number): string =>
				`#${[0, 1, 2].map((channel) => (data[offset + channel] ?? 0).toString(16).padStart(2, '0')).join('')}`;
			let found = false;
			if (wanted !== '') {
				for (let offset = 0; offset < data.length && !found; offset += 4) {
					found = hexAt(offset) === wanted;
				}
			}
			return {
				width: image.naturalWidth,
				height: image.naturalHeight,
				colors: at.map(([x, y]) => hexAt((y * canvas.width + x) * 4)),
				found,
			};
		},
		{ src: url, at: points, side: drawn, wanted: find },
	);
}

test('the page is Роадтрип, and its description names visas, closed countries and the time at the border', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle('Роадтрип | Куда поехать на машине');
	expect((await headOf(page)).meta).toMatchObject({
		'apple-mobile-web-app-title': 'Роадтрип',
		description: DESCRIPTION,
		'og:description': DESCRIPTION,
	});
});

test('a phone puts the mark on a blue square on its home screen, under the name Роадтрип', async ({ page, request }) => {
	await page.goto('/');
	const head = await headOf(page);

	const icons = [
		{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
		{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
		{ src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
	];
	const manifest = await request.get(hrefIn(head, { rel: 'manifest' }));
	expect(manifest.status()).toBe(200);
	// Only the icon and its name: no app of its own on the home screen (#70, out of scope), so `display` is `browser`.
	expect(await manifest.json()).toMatchObject({ name: 'Роадтрип', short_name: 'Роадтрип', display: 'browser', icons });

	const homeIcons = [
		{ src: hrefIn(head, { rel: 'apple-touch-icon' }), side: 180 },
		...icons.map(({ src, sizes }) => ({ src, side: Number(sizes.split('x')[0]) })),
	];
	for (const { src, side } of homeIcons) {
		const middle = Math.floor(side / 2);
		expect(
			await readImage(page, src, {
				points: [
					[0, 0],
					[middle, middle],
				],
			}),
		).toMatchObject({
			width: side,
			height: side,
			colors: [RING_BLUE, START_RED],
		});
	}
});

test('the tab shows the mark, its origin red in the light scheme and in the dark one', async ({ page, request }) => {
	await page.goto('/');
	const head = await headOf(page);

	const svg = hrefIn(head, { rel: 'icon', type: 'image/svg+xml' });
	expect((await readImage(page, svg, { points: [[32, 32]], drawn: 64 })).colors).toEqual([START_RED]);
	await page.emulateMedia({ colorScheme: 'dark' });
	expect((await readImage(page, svg, { points: [[32, 32]], drawn: 64 })).colors).toEqual([START_RED_DARK]);

	// For the browsers without SVG icons, 32 px. The page cannot fetch a path that ends in favicon.ico under
	// Playwright's routes, so the test does.
	const ico = await request.get(hrefIn(head, { rel: 'icon', sizes: '32x32' }));
	expect(ico.status()).toBe(200);
	const data = `data:image/x-icon;base64,${(await ico.body()).toString('base64')}`;
	expect(await readImage(page, data, { points: [[16, 16]] })).toMatchObject({ width: 32, height: 32, colors: [START_RED] });
});

test("a link to the site shows a picture of 1200×630 with the mark on the screen's background", async ({ page }) => {
	await openInProduction(page);

	expect((await headOf(page)).meta).toMatchObject({
		'og:image': `${PRODUCTION}/og.png`,
		'twitter:card': 'summary_large_image',
	});
	expect(await readImage(page, `${PRODUCTION}/og.png`, { points: [[0, 0]], find: START_RED })).toEqual({
		width: 1200,
		height: 630,
		colors: [BACKGROUND],
		found: true,
	});
});
