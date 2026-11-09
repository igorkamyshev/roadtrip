// `pnpm --filter web record <steps.ts> <out-dir>`: a video of the screen without the Worker (e2e/demo.ts), for a
// PR's «Evidence» (web/README.md, «Demo»). It builds the client, serves it with the doubles, opens a phone of 390×844
// in Chromium with a dot where the finger is, and runs the steps the file's default export takes. `<out-dir>` gets
// `recording.mp4` (`recording.webm` without ffmpeg) and a PNG for each `shot`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium, type Locator, type Page } from '@playwright/test';
import { startDemo } from './demo.ts';

const VIEWPORT = { width: 390, height: 844 } as const;

/** Long enough for a person watching to see the finger arrive before it taps. */
const AIM_MS = 400;

/** A point on the screen, in CSS pixels. */
interface Point {
	readonly x: number;
	readonly y: number;
}

/** What a steps file's default export gets: the page and the gestures a person can follow on the video. */
export interface Recording {
	readonly page: Page;
	/** Opens the screen at `path` of the demo: `/#/?p=44.81760,20.45730&h=6&cit=RUS`. */
	readonly open: (path: string) => Promise<void>;
	/**
	 * Moves the finger to the target and taps it. A locator is tapped in the middle of its part on the screen, on the
	 * line of its first heading if it has one: a card that only peeks from the carousel's edge is tapped there, where
	 * Playwright's `click` would scroll it into view first.
	 */
	readonly tap: (target: Locator | Point) => Promise<void>;
	/** Drags the finger from one point to the other, as across the map. */
	readonly drag: (from: Point, to: Point) => Promise<void>;
	/** Holds still, so the video shows what happened. */
	readonly pause: (ms: number) => Promise<void>;
	/** Saves the screen as `<n>-<name>.png` in the out dir, at twice the pixels. */
	readonly shot: (name: string) => Promise<void>;
}

/** A dot that follows the pointer while it is down or moving, so the video shows where the finger is. */
const FINGER = `addEventListener('DOMContentLoaded', () => {
	const dot = document.createElement('div');
	dot.style.cssText = 'position:fixed;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:rgb(255 80 40 / 55%);border:2px solid #fff;pointer-events:none;z-index:2147483647;display:none';
	document.body.append(dot);
	const move = (event) => {
		dot.style.display = 'block';
		dot.style.left = event.clientX + 'px';
		dot.style.top = event.clientY + 'px';
	};
	addEventListener('pointerdown', move, true);
	addEventListener('pointermove', move, true);
});`;

/** Where a locator is tapped: the middle of its part on the screen, on its first heading's line if it has one. */
async function tapPoint(target: Locator): Promise<Point> {
	const box = await target.boundingBox();
	if (box === null) {
		throw new Error(`${String(target)} is not on the screen`);
	}
	const heading = target.getByRole('heading').first();
	const line = (await heading.count()) > 0 ? await heading.boundingBox() : null;
	const left = Math.max(box.x, 0);
	const right = Math.min(box.x + box.width, VIEWPORT.width);
	return { x: (left + right) / 2, y: line === null ? box.y + box.height / 2 : line.y + line.height / 2 };
}

function recording(page: Page, { base, out }: { readonly base: string; readonly out: string }): Recording {
	let shots = 0;
	return {
		page,
		open: async (path) => {
			await page.goto(new URL(path, base).href);
		},
		tap: async (target) => {
			const point = 'x' in target ? target : await tapPoint(target);
			await page.mouse.move(point.x - 40, point.y + 80);
			await page.mouse.move(point.x, point.y, { steps: 15 });
			await sleep(AIM_MS);
			await page.mouse.click(point.x, point.y);
		},
		drag: async (from, to) => {
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			await page.mouse.move(to.x, to.y, { steps: 25 });
			await page.mouse.up();
		},
		pause: async (ms) => {
			await sleep(ms);
		},
		shot: async (name) => {
			shots += 1;
			await page.screenshot({ path: join(out, `${shots}-${name}.png`) });
		},
	};
}

/** The video as `recording.mp4` in `out`, which plays on a phone; `recording.webm` when ffmpeg is not installed. */
function saveVideo(out: string): string {
	const webm = readdirSync(out).find((file) => file.endsWith('.webm'));
	if (webm === undefined) {
		throw new Error(`Playwright wrote no video into ${out}`);
	}
	const mp4 = join(out, 'recording.mp4');
	const ffmpeg = spawnSync(
		'ffmpeg',
		['-loglevel', 'error', '-y', '-i', join(out, webm), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
		{
			stdio: 'inherit',
		},
	);
	if (ffmpeg.status === 0) {
		rmSync(join(out, webm));
		return mp4;
	}
	renameSync(join(out, webm), join(out, 'recording.webm'));
	return join(out, 'recording.webm');
}

/** A steps file: its default export runs the steps. */
interface Steps {
	readonly default: (screen: Recording) => Promise<void>;
}

function isSteps(module: unknown): module is Steps {
	return typeof module === 'object' && module !== null && 'default' in module && typeof module.default === 'function';
}

// Paths are the caller's: pnpm runs the script in web/ and says where it was called from.
const callerDir = process.env.INIT_CWD ?? process.cwd();
const stepsFile = process.argv.at(2);
const outDir = process.argv.at(3);
if (stepsFile === undefined || outDir === undefined) {
	throw new Error('Usage: pnpm --filter web record <steps.ts> <out-dir>');
}
const out = resolve(callerDir, outDir);
mkdirSync(out, { recursive: true });
const steps: unknown = await import(pathToFileURL(resolve(callerDir, stepsFile)).href);
if (!isSteps(steps)) {
	throw new Error(`${stepsFile} has no default export of the steps`);
}

// Port 0: any free one, so a demo or a test run already up stays where it is.
const server = await startDemo(0);
const base = server.resolvedUrls?.local[0];
if (base === undefined) {
	throw new Error('The demo server has no local URL');
}
const browser = await chromium.launch();
try {
	const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, recordVideo: { dir: out, size: VIEWPORT } });
	await context.addInitScript(FINGER);
	await steps.default(recording(await context.newPage(), { base, out }));
	await context.close();
	process.stdout.write(`${saveVideo(out)}\n`);
} finally {
	await browser.close();
	await server.close();
}
