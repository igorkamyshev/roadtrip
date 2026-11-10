// `pnpm --filter web shots <out-dir> <link>… [--viewport <W>x<H>,…] [--theme light|dark|both] [--wait <ms>]`: PNGs of
// the screen without the Worker (e2e/demo.ts), for a PR's «Evidence» or a look at a layout (web/README.md, «Demo»). It
// builds the client, serves it with the doubles, and in Chromium opens each link (the part from `/#/`) on each viewport
// in each theme, at deviceScaleFactor 2, and shoots it once the first card is no longer calculating and `--wait` ms
// more have passed (5000 and more: after the data's sources have gone). `<out-dir>` gets
// `<link's number>-<W>x<H>-<theme>.png`.
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { type Browser, chromium, expect } from '@playwright/test';
import { startDemo } from './demo.ts';

type Theme = 'light' | 'dark';

/** A shot: a link of the demo, a viewport, a theme, and the file it goes to. */
interface Shot {
	readonly path: string;
	readonly width: number;
	readonly height: number;
	readonly theme: Theme;
	readonly file: string;
}

/** The themes of `--theme`; undefined for anything else. */
function themesOf(text: string): readonly Theme[] | undefined {
	if (text === 'both') {
		return ['light', 'dark'];
	}
	return text === 'light' || text === 'dark' ? [text] : undefined;
}

/** Opens the shot's link of the demo at `base` on its viewport and theme, waits for the ring and `wait` ms more, and writes the PNG. */
async function shoot(browser: Browser, { base, wait }: { readonly base: string; readonly wait: number }, shot: Shot): Promise<void> {
	const page = await browser.newPage({
		viewport: { width: shot.width, height: shot.height },
		deviceScaleFactor: 2,
		colorScheme: shot.theme,
	});
	await page.goto(new URL(shot.path, base).href);
	await expect(page.getByTestId('first-card')).not.toHaveAttribute('data-state', 'calculating', { timeout: 30_000 });
	await sleep(wait);
	await page.screenshot({ path: shot.file });
	await page.close();
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		viewport: { type: 'string', default: '390x844' },
		theme: { type: 'string', default: 'light' },
		wait: { type: 'string', default: '0' },
	},
});
const [outDir = '', ...links] = positionals;
const viewports = values.viewport.split(',').map((text) => text.split('x').map(Number));
const themes = themesOf(values.theme);
const wait = Number(values.wait);
if (
	links.length === 0 ||
	themes === undefined ||
	!Number.isFinite(wait) ||
	!viewports.every((size) => size.length === 2 && size.every((side) => Number.isInteger(side) && side > 0))
) {
	throw new Error('Usage: pnpm --filter web shots <out-dir> <link>… [--viewport <W>x<H>,…] [--theme light|dark|both] [--wait <ms>]');
}

// Paths are the caller's: pnpm runs the script in web/ and says where it was called from.
const out = resolve(process.env.INIT_CWD ?? process.cwd(), outDir);
mkdirSync(out, { recursive: true });
const shots: Shot[] = links.flatMap((link, at) =>
	viewports.flatMap(([width, height]) =>
		themes.map((theme) => ({
			path: link.includes('/#/') ? link.slice(link.indexOf('/#/')) : link,
			width,
			height,
			theme,
			file: join(out, `${at + 1}-${width}x${height}-${theme}.png`),
		})),
	),
);

// Port 0: any free one, so a demo or a test run already up stays where it is.
const server = await startDemo(0);
const base = server.resolvedUrls?.local[0];
if (base === undefined) {
	throw new Error('The demo server has no local URL');
}
const browser = await chromium.launch();
try {
	for (const shot of shots) {
		await shoot(browser, { base, wait }, shot);
		process.stdout.write(`${shot.file}\n`);
	}
} finally {
	await browser.close();
	await server.close();
}
