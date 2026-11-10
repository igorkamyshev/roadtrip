// `pnpm --filter web icons`: Роадтрип's mark (#70) and every file made of it in public/, written anew: the tab's icon
// (favicon.svg, which takes the dark scheme's colours by itself, and favicon.ico for the browsers without SVG), the home
// screen's (apple-touch-icon.png, the manifest's icon-192, icon-512 and icon-maskable-512) and the link's picture
// (og.png). The outline is below; the colours are the screen's, read from src/styles.css; the PNGs are Chromium's
// screenshots of SVG. A change of either is a run of this script, and the files in the repository are its output, byte
// for byte.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, chromium } from '@playwright/test';

const WEB = join(import.meta.dirname, '..');
const PUBLIC = join(WEB, 'public');
const FONTS = join(WEB, 'node_modules', '@fontsource');

/**
 * The mark on a viewBox of 64: the ring as on the map, an uneven closed outline, and the origin's red dot in its
 * middle. The outline must stay uneven, never a circle, and the strokes this thick, so the mark reads at 16 px.
 */
const RING = 'M32 7 C42 6 50 12 54 20 C58 28 60 36 55 44 C51 51 44 57 35 56 C27 56 18 58 12 51 C6 45 7 36 9 28 C11 19 22 8 32 7 Z';
const RING_STROKE = 5;

/** The tokens of src/styles.css the mark takes, of the light scheme (`:root`) or the dark one. */
interface Palette {
	readonly bg: string;
	readonly fg: string;
	readonly muted: string;
	readonly ring: string;
	readonly ringFill: string;
	readonly start: string;
	readonly halo: string;
}

/**
 * The screen's palette of each scheme: the tokens of the first `:root` block for the light one, of the first block
 * under `prefers-color-scheme: dark` for the dark one.
 */
function palettes(): { readonly light: Palette; readonly dark: Palette } {
	const css = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');
	const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
	const read = (from: number, name: string): string => {
		const match = new RegExp(String.raw`--${name}:\s*([^;]+);`, 'u').exec(css.slice(from));
		const value = match?.[1];
		if (value === undefined) {
			throw new Error(`src/styles.css has no --${name} after character ${from}`);
		}
		return value.trim();
	};
	const palette = (from: number): Palette => ({
		bg: read(from, 'bg'),
		fg: read(from, 'fg'),
		muted: read(from, 'muted'),
		ring: read(from, 'ring'),
		ringFill: read(from, 'ring-fill'),
		start: read(from, 'start'),
		halo: read(from, 'halo'),
	});
	return { light: palette(0), dark: palette(darkStart) };
}

/** The colours of one rendering of the mark: the ring's line and fill, the dot and its outline. */
interface MarkColors {
	readonly line: string;
	readonly fill: string;
	readonly dot: string;
	readonly dotOutline: string;
}

/** The mark on the screen's background: the ring's colours, the origin's red outlined in the cities' halo (`--halo`). */
function onBackground(palette: Palette): MarkColors {
	return { line: palette.ring, fill: palette.ringFill, dot: palette.start, dotOutline: palette.halo };
}

/** The mark on the home screen's square of `--ring`: the ring in white, the origin's red outlined in white. */
function onRing(palette: Palette): MarkColors {
	return { line: '#fff', fill: 'rgb(255 255 255 / 24%)', dot: palette.start, dotOutline: '#fff' };
}

/** The mark's shapes in `colors`; without them, in the classes `ring` and `dot` that a stylesheet colours. */
function markShapes(colors?: MarkColors): string {
	const ring = colors ? `fill="${colors.fill}" stroke="${colors.line}"` : 'class="ring"';
	const dot = colors ? `fill="${colors.dot}" stroke="${colors.dotOutline}"` : 'class="dot"';
	return [
		`<path d="${RING}" ${ring} stroke-width="${RING_STROKE}" stroke-linejoin="round"/>`,
		`<circle cx="32" cy="32" r="7" ${dot} stroke-width="3"/>`,
	].join('');
}

/** The rules that colour the classes `ring` and `dot`. */
function markStyle(colors: MarkColors): string {
	return `.ring{fill:${colors.fill};stroke:${colors.line}}.dot{fill:${colors.dot};stroke:${colors.dotOutline}}`;
}

/** The tab's icon: the light scheme's colours, the dark's when the browser is dark. */
function favicon(light: Palette, dark: Palette): string {
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
		`<style>${markStyle(onBackground(light))}@media (prefers-color-scheme: dark){${markStyle(onBackground(dark))}}</style>`,
		markShapes(),
		'</svg>\n',
	].join('');
}

/** Where the ring lies on the viewBox, its stroke included: its box's middle and longer side, and its farthest point from that middle. */
interface RingExtent {
	readonly middle: { readonly x: number; readonly y: number };
	readonly side: number;
	readonly reach: number;
}

/** Measures the ring in Chromium: its outline's box and points, widened by half the stroke. */
async function measureRing(browser: Browser): Promise<RingExtent> {
	const page = await browser.newPage();
	await page.setContent(`<svg viewBox="0 0 64 64"><path d="${RING}"/></svg>`);
	const extent = await page.evaluate(
		([halfStroke]) => {
			const path = document.querySelector('path');
			if (!path) {
				throw new Error('no path');
			}
			const box = path.getBBox();
			const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
			const length = path.getTotalLength();
			let farthest = 0;
			for (let step = 0; step < 1000; step += 1) {
				const point = path.getPointAtLength((length * step) / 1000);
				farthest = Math.max(farthest, Math.hypot(point.x - middle.x, point.y - middle.y));
			}
			return { middle, side: Math.max(box.width, box.height) + 2 * halfStroke, reach: farthest + halfStroke };
		},
		[RING_STROKE / 2],
	);
	await page.close();
	return extent;
}

/**
 * The home screen's icon: the mark, `scale` times its size, in the middle of a square of `--ring` with no corners of
 * its own (the system rounds it).
 */
function homeIcon(palette: Palette, extent: RingExtent, scale: number): string {
	const { x, y } = extent.middle;
	return [
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
		`<rect width="64" height="64" fill="${palette.ring}"/>`,
		`<g transform="translate(32 32) scale(${scale.toFixed(4)}) translate(${(-x).toFixed(4)} ${(-y).toFixed(4)})">`,
		markShapes(onRing(palette)),
		'</g></svg>',
	].join('');
}

/** A font file of @fontsource as a data URL. */
function font(file: string): string {
	return `data:font/woff2;base64,${readFileSync(join(FONTS, file)).toString('base64')}`;
}

/** The link's picture, 1200×630: on `--bg`, the mark, «Роадтрип» in the screen's headings' font and its line. */
function ogPage(palette: Palette): string {
	return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>
@font-face{font-family:Unbounded;font-weight:700;src:url(${font('unbounded/files/unbounded-cyrillic-700-normal.woff2')})}
@font-face{font-family:'Golos Text';font-weight:500;src:url(${font('golos-text/files/golos-text-cyrillic-500-normal.woff2')})}
html,body{margin:0;width:1200px;height:630px;background:${palette.bg}}
body{display:flex;align-items:center;justify-content:center;gap:56px}
svg{width:260px;height:260px;flex:none}
h1{margin:0;font:700 104px/1 Unbounded;color:${palette.fg};letter-spacing:-0.01em}
p{margin:28px 0 0;font:500 44px/1.2 'Golos Text';color:${palette.muted}}
</style></head><body>
<svg viewBox="0 0 64 64">${markShapes(onBackground(palette))}</svg>
<div><h1>Роадтрип</h1><p>Куда поехать на машине</p></div>
</body></html>`;
}

/** A page with nothing but `svg`, drawn over all of it. */
function svgPage(svg: string): string {
	return `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`;
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

/** A square PNG of `html`, `side` pixels on each side. */
async function squarePng(browser: Browser, html: string, side: number): Promise<Buffer> {
	return png(browser, html, { width: side, height: side });
}

/** An ICO of PNGs (each up to 255 px), which every browser since 2007 reads. */
function ico(images: readonly { readonly side: number; readonly data: Buffer }[]): Buffer {
	const header = Buffer.alloc(6);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(images.length, 4);
	let offset = 6 + 16 * images.length;
	const entries = images.map(({ side, data }) => {
		const entry = Buffer.alloc(16);
		entry.writeUInt8(side, 0);
		entry.writeUInt8(side, 1);
		entry.writeUInt16LE(1, 4);
		entry.writeUInt16LE(32, 6);
		entry.writeUInt32LE(data.length, 8);
		entry.writeUInt32LE(offset, 12);
		offset += data.length;
		return entry;
	});
	return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}

const { light, dark } = palettes();
const browser = await chromium.launch();
const ring = await measureRing(browser);
const tabPage = svgPage(favicon(light, dark));
// The home screen's icon: the mark's box 0.8 of the square, margins of about a tenth.
const home = svgPage(homeIcon(light, ring, (0.8 * 64) / ring.side));
// The maskable one: the mark's farthest point 0.36 of the square from its middle, inside the circle of 0.4 every mask leaves.
const maskable = svgPage(homeIcon(light, ring, (0.36 * 64) / ring.reach));
const files: Record<string, Buffer | string> = {
	'favicon.svg': favicon(light, dark),
	'favicon.ico': ico([
		{ side: 16, data: await png(browser, tabPage, { width: 16, height: 16, transparent: true }) },
		{ side: 32, data: await png(browser, tabPage, { width: 32, height: 32, transparent: true }) },
	]),
	'apple-touch-icon.png': await squarePng(browser, home, 180),
	'icon-192.png': await squarePng(browser, home, 192),
	'icon-512.png': await squarePng(browser, home, 512),
	'icon-maskable-512.png': await squarePng(browser, maskable, 512),
	'og.png': await png(browser, ogPage(light), { width: 1200, height: 630 }),
};
await browser.close();
for (const [name, content] of Object.entries(files)) {
	writeFileSync(join(PUBLIC, name), content);
}
