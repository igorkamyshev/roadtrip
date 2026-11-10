// Where `shots` (tools/shots.ts) opens the page of a shot and shoots it: in headless Chromium at deviceScaleFactor 2,
// or, for `--window`, in Chromium's window on an X display of its own (Xvfb), whose screen ImageMagick's `import`
// captures, so the shot shows the tab with its title and icon and the address bar, as a person sees them.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { type BrowserContext, chromium, type Page } from '@playwright/test';
import { keepMapForTests } from '../e2e/screen.ts';
import type { Theme } from './compare-page.ts';

/** What a shot's page is opened at. */
interface PageSize {
	readonly width: number;
	readonly height: number;
	readonly theme: Theme;
}

/** Opens a shot's page, writes it to a PNG, lets it go, and at the end closes every browser. */
export interface Pages {
	readonly open: (size: PageSize) => Promise<Page>;
	readonly shoot: (page: Page, file: string) => Promise<void>;
	readonly release: (page: Page) => Promise<void>;
	readonly close: () => Promise<void>;
}

/** As the screen tests: a Russian reader. */
const LOCALE = 'ru-RU';

/** Every shot in one headless Chromium, a page each, at deviceScaleFactor 2. */
export async function headlessPages(): Promise<Pages> {
	const browser = await chromium.launch();
	return {
		open: async ({ width, height, theme }) => {
			const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: theme, locale: LOCALE });
			// So that `mapAtRest` can wait for the map's camera.
			await keepMapForTests(page);
			return page;
		},
		shoot: async (page, file) => {
			await page.screenshot({ path: file });
		},
		release: async (page) => page.close(),
		close: async () => browser.close(),
	};
}

/** Starts Xvfb on a free display, which it names on file descriptor 3, with a screen of `width`×`height`. */
async function startDisplay(width: number, height: number): Promise<{ readonly name: string; readonly stop: () => void }> {
	const xvfb = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', `${width}x${height}x24`, '-nolisten', 'tcp'], {
		stdio: ['ignore', 'ignore', 'ignore', 'pipe'],
	});
	const named = xvfb.stdio[3];
	if (!(named instanceof Readable)) {
		xvfb.kill();
		throw new TypeError('Xvfb has no pipe on file descriptor 3');
	}
	const number = await new Promise<string>((found, failed) => {
		let text = '';
		named.on('data', (chunk: Buffer) => {
			text += chunk.toString();
			if (text.includes('\n')) {
				found(text.trim());
			}
		});
		xvfb.once('error', failed);
		xvfb.once('exit', (code) => {
			failed(new Error(`Xvfb exited with ${String(code)} before it named its display`));
		});
	});
	return {
		name: `:${number}`,
		stop: () => {
			xvfb.kill();
		},
	};
}

/** A Chromium window of `theme` on `display` at the screen's top left: Chromium's dark look for the dark theme. */
async function openWindow(
	theme: Theme,
	display: string,
): Promise<{ readonly context: BrowserContext; readonly close: () => Promise<void> }> {
	// A profile of its own, which offers no translation of a Russian page: its bubble would cover the screen, and
	// Playwright's own `--disable-features=Translate` does not stop it.
	const profile = mkdtempSync(join(tmpdir(), 'roadtrip-window-'));
	mkdirSync(join(profile, 'Default'));
	writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ translate: { enabled: false } }));
	const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
	const context = await chromium.launchPersistentContext(profile, {
		headless: false,
		env: { ...env, DISPLAY: display },
		args: ['--window-position=0,0', ...(theme === 'dark' ? ['--force-dark-mode'] : [])],
		colorScheme: theme,
		locale: LOCALE,
	});
	await keepMapForTests(context);
	return {
		context,
		close: async () => {
			await context.close();
			rmSync(profile, { recursive: true, force: true });
		},
	};
}

/**
 * Every shot in Chromium's window, a window for each theme, one tab in it, the page of each shot loaded there in turn,
 * on a display with room for the largest of `viewports` and the window's tabs and toolbar. The window is at least about
 * 500 px wide, so a phone's viewport sits at its left, with a blank strip to its right and a thinner one under it.
 */
export async function windowPages(viewports: readonly { readonly width: number; readonly height: number }[]): Promise<Pages> {
	const display = await startDisplay(
		Math.max(1280, ...viewports.map(({ width }) => width + 100)),
		Math.max(...viewports.map(({ height }) => height)) + 300,
	);
	const windows = new Map<Theme, Promise<Awaited<ReturnType<typeof openWindow>>>>();
	return {
		open: async (size) => {
			const opening = windows.get(size.theme) ?? openWindow(size.theme, display.name);
			windows.set(size.theme, opening);
			const { context } = await opening;
			const page = context.pages()[0] ?? (await context.newPage());
			await page.setViewportSize({ width: size.width, height: size.height });
			return page;
		},
		shoot: async (page, file) => {
			// The page, not the address bar, which takes the focus on the window's first, blank tab.
			await page.bringToFront();
			const [outerWidth, outerHeight] = await page.evaluate(() => [window.outerWidth, window.outerHeight]);
			execFileSync('import', ['-display', display.name, '-window', 'root', '-crop', `${outerWidth}x${outerHeight}+0+0`, '+repage', file]);
		},
		// Nothing to let go: the tab stays for the next shot, as a new one would open a window of its own, not at the
		// screen's top left.
		release: async () => {},
		close: async () => {
			await Promise.all([...windows.values()].map(async (opening) => (await opening).close()));
			display.stop();
		},
	};
}
