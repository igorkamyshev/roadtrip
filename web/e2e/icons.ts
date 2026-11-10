// `pnpm --filter web icons`: Роадтрип's mark (#70) and every file made of it in public/, written anew from the
// geometry below: the tab's icon (favicon.svg, which takes the dark scheme's colours by itself, and favicon.ico for the
// browsers without SVG), the home screen's (apple-touch-icon.png, the manifest's icon-192, icon-512 and
// icon-maskable-512) and the link's picture (og.png). The PNGs are Chromium's screenshots of SVG, so a change of the
// mark is a change here and a run; the files in the repository are this script's output, byte for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium } from '@playwright/test';

const PUBLIC = join(import.meta.dirname, '..', 'public');
const FONTS = join(import.meta.dirname, '..', 'node_modules', '@fontsource');

/**
 * The mark on a viewBox of 64: the ring as on the map, an uneven closed outline, and the origin's red dot in its
 * middle. The outline must stay uneven, never a circle, and the strokes this thick, so the mark reads at 16 px.
 */
const RING = 'M32 7 C42 6 50 12 54 20 C58 28 60 36 55 44 C51 51 44 57 35 56 C27 56 18 58 12 51 C6 45 7 36 9 28 C11 19 22 8 32 7 Z';

/** The middle of the ring's box, its stroke included: x 4.95–60.47, y 4.39–58.76 (Chromium's `getBBox` plus 2.5). */
const RING_MIDDLE = { x: 32.71, y: 31.58 };

/** The colours of one rendering of the mark. */
interface Colors {
	readonly ring: string;
	readonly fillOpacity: number;
	readonly start: string;
	readonly startStroke: string;
}

/** The screen's palette (src/styles.css): `--ring`, `--start`, and the dot's outline in the cities' halo, `--halo`. */
const LIGHT: Colors = { ring: '#1b5fd6', fillOpacity: 0.24, start: '#e2412c', startStroke: '#f4f6f2' };
const DARK: Colors = { ring: '#6aa3ff', fillOpacity: 0.24, start: '#ff6a52', startStroke: '#1c2321' };
/** On the home screen's blue square, `--ring`: a white ring and a white outline round the red dot. */
const ON_BLUE: Colors = { ring: '#fff', fillOpacity: 0.24, start: '#e2412c', startStroke: '#fff' };
const BG = '#eef1ef';
const FG = '#16201d';
const MUTED = '#5d6a66';

/** The mark's shapes in `colors`; without them, in the classes `ring` and `start` that a stylesheet colours. */
function mark(colors?: Colors): string {
	const ring = colors
		? `fill="${colors.ring}" fill-opacity="${colors.fillOpacity}" stroke="${colors.ring}"`
		: 'class="ring" fill-opacity="0.24"';
	const start = colors ? `fill="${colors.start}" stroke="${colors.startStroke}"` : 'class="start"';
	return [
		`<path d="${RING}" ${ring} stroke-width="5" stroke-linejoin="round"/>`,
		`<circle cx="32" cy="32" r="7" ${start} stroke-width="3"/>`,
	].join('');
}

/** The colours of the classes `ring` and `start`. */
function rules(colors: Colors): string {
	return `.ring{fill:${colors.ring};stroke:${colors.ring}}.start{fill:${colors.start};stroke:${colors.startStroke}}`;
}

/** The tab's icon: the light scheme's colours, the dark's when the browser is dark. */
function favicon(): string {
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
		`<style>${rules(LIGHT)}@media (prefers-color-scheme: dark){${rules(DARK)}}</style>`,
		mark(),
		'</svg>\n',
	].join('');
}

/**
 * The home screen's icon: the mark on a square of `--ring` with no corners of its own (the system rounds it), its box
 * (55.52 wide) `scale` of the square wide. 0.8 leaves margins of about a tenth. A maskable icon takes 0.66: the mark's
 * farthest point, 30.5 from its middle, then stays in the middle circle of 0.8 of the square, which every mask leaves.
 */
function homeIcon(scale: number): string {
	const k = (scale * 64) / 55.52;
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
		`<rect width="64" height="64" fill="${LIGHT.ring}"/>`,
		`<g transform="translate(32 32) scale(${k.toFixed(4)}) translate(${-RING_MIDDLE.x} ${-RING_MIDDLE.y})">`,
		mark(ON_BLUE),
		'</g></svg>',
	].join('');
}

/** A font file of @fontsource as a data URL. */
function font(file: string): string {
	return `data:font/woff2;base64,${readFileSync(join(FONTS, file)).toString('base64')}`;
}

/** The link's picture, 1200×630: on `--bg`, the mark, «Роадтрип» in the screen's headings' font and its line. */
function ogPage(): string {
	return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face{font-family:Unbounded;font-weight:700;src:url(${font('unbounded/files/unbounded-cyrillic-700-normal.woff2')})}
@font-face{font-family:'Golos Text';font-weight:500;src:url(${font('golos-text/files/golos-text-cyrillic-500-normal.woff2')})}
html,body{margin:0;width:1200px;height:630px;background:${BG}}
body{display:flex;align-items:center;justify-content:center;gap:56px}
svg{width:260px;height:260px;flex:none}
h1{margin:0;font:700 104px/1 Unbounded;color:${FG};letter-spacing:-0.01em}
p{margin:28px 0 0;font:500 44px/1.2 'Golos Text';color:${MUTED}}
</style></head><body>
<svg viewBox="0 0 64 64">${mark(LIGHT)}</svg>
<div><h1>Роадтрип</h1><p>Куда поехать на машине</p></div>
</body></html>`;
}

/** The size of a PNG in CSS pixels, one pixel each; `transparent` keeps what the page does not paint clear. */
interface Shot {
	readonly width: number;
	readonly height: number;
	readonly transparent?: boolean;
}

/** A PNG of `html` in the light scheme. */
async function png(browser: Browser, html: string, { width, height, transparent = false }: Shot): Promise<Buffer> {
	const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: 'light' });
	await page.setContent(html);
	await page.evaluate(() => document.fonts.ready);
	const shot = await page.screenshot({ omitBackground: transparent });
	await page.close();
	return shot;
}

/** An SVG drawn over the whole page. */
function full(svg: string): string {
	return `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`;
}

/** An ICO of PNGs (each up to 255 px), which every browser since 2007 reads. */
function ico(images: readonly { readonly size: number; readonly data: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = 6 + 16 * images.length;
	const entries = images.map(({ size, data }) => {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(size, 0);
		entry.writeUInt8(size, 1);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(data.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += data.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

const browser = await chromium.launch();
const tab = full(favicon());
const files: Record<string, Buffer | string> = {
	'favicon.svg': favicon(),
	'favicon.ico': ico([
		{ size: 16, data: await png(browser, tab, { width: 16, height: 16, transparent: true }) },
		{ size: 32, data: await png(browser, tab, { width: 32, height: 32, transparent: true }) },
	]),
	'apple-touch-icon.png': await png(browser, full(homeIcon(0.8)), { width: 180, height: 180 }),
	'icon-192.png': await png(browser, full(homeIcon(0.8)), { width: 192, height: 192 }),
	'icon-512.png': await png(browser, full(homeIcon(0.8)), { width: 512, height: 512 }),
	'icon-maskable-512.png': await png(browser, full(homeIcon(0.66)), { width: 512, height: 512 }),
	'og.png': await png(browser, ogPage(), { width: 1200, height: 630 }),
};
await browser.close();
for (const [name, content] of Object.entries(files)) {
	writeFileSync(join(PUBLIC, name), content);
}
