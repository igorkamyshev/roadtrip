// `pnpm --filter web shots <out-dir> [<link>…] [--viewport <W>x<H>,…] [--theme light|dark|both] [--wait <ms>]
// [--card <name>] [--compare <ref> [--title <title>]] [--window]`: PNGs of the screen without the Worker (tools/demo.ts),
// for a PR's «Evidence» or a look at a layout (web/README.md, «Demo»). It builds the client, serves it with the doubles,
// and in Chromium opens each link (the part from `/#/`; by default Belgrade at 6 h, a ring with cities and places) on
// each viewport in each theme, at deviceScaleFactor 2, and shoots it once the first card is no longer calculating, the
// map's camera has stopped, and `--wait` ms more have passed (5000 and more: after the data's sources have gone).
// `<out-dir>` gets `<link's number>-<W>x<H>-<theme>.png`.
//
// `--card <name>` first scrolls the carousel until the card of that point of interest (its heading) is the chosen one,
// as a person would, and also shoots the card alone, to `…-<theme>-card.png`; a ring without that card fails.
// `--compare <ref>` also builds the client of git ref `<ref>` (`origin/main`) in a worktree of its own, removed at the
// end, serves it with this checkout's doubles and shoots it the same way: its files are `before-…`, this checkout's
// `after-…`, and `index.html` (tools/compare-page.ts) puts them side by side, titled `--title`, for a private artifact.
//
// `--window` shoots the browser's whole window instead, its tab (title and icon) and address bar included, at one pixel
// per CSS pixel: Chromium runs with a window on a display of its own (Xvfb), in its dark look for the dark theme, and
// ImageMagick's `import` captures the screen. A window is at least about 500 px wide, so a phone's viewport sits at its
// left. Xvfb and ImageMagick are on a cloud session's machine; elsewhere, install them.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { expect, type Locator, type Page } from '@playwright/test';
import { comparePage, type Shot, type Theme } from './compare-page.ts';
import { startDemo } from './demo.ts';
import { mapAtRest } from '../e2e/screen.ts';
import { headlessPages, type Pages, windowPages } from './pages.ts';

/** Belgrade at 6 h: the demo's ring with cities and places (at 3 h it has none). */
const DEFAULT_LINK = '/#/?p=44.81760,20.45730&h=6&cit=RUS';

/** How long the page may take to load and its ring, cities and places to come. */
const READY_TIMEOUT_MS = 30_000;

/** A client being shot: where it is served and the prefix of its files (`before-`, `after-`, or none). */
interface Side {
	readonly base: string;
	readonly prefix: string;
}

interface Run {
	readonly out: string;
	readonly wait: number;
	/** The point of interest of `--card`. */
	readonly card: string | undefined;
	/** Where each shot's page opens and is shot: headless, or in a window (`--window`). */
	readonly pages: Pages;
}

/** The themes of `--theme`; undefined for anything else. */
function themesOf(text: string): readonly Theme[] | undefined {
	if (text === 'both') {
		return ['light', 'dark'];
	}
	return text === 'light' || text === 'dark' ? [text] : undefined;
}

/**
 * Scrolls the carousel to the card of the point of interest named `name`, a city or a place, as `scrollTo` of
 * cities.spec.ts does, and waits until it is the chosen one.
 */
async function chooseCard(page: Page, name: string, path: string): Promise<Locator> {
	// `city-card` is the card of a build from before #160, for `--compare` against one.
	const cards = page.getByTestId(/^(point|city)-card$/u);
	const card = cards.filter({ has: page.getByRole('heading', { name, exact: true }) });
	// The cards come at once, with the cities and places files.
	await cards.first().waitFor({ timeout: READY_TIMEOUT_MS });
	if ((await card.count()) === 0) {
		const names = await cards.getByRole('heading').allTextContents();
		throw new Error(`No card of «${name}» in the carousel of ${path}, only: ${names.join(', ')}`);
	}
	await card.evaluate((element) => {
		element.scrollIntoView({ inline: 'start', block: 'nearest' });
	});
	await expect(card).toHaveAttribute('aria-current', 'true', { timeout: READY_TIMEOUT_MS });
	return card;
}

/** Opens the shot's link on `side` on its viewport and theme, waits for the ring (and the card), `wait` ms more, and writes the PNGs. */
async function shoot({ out, wait, card, pages }: Run, { side, shot }: { readonly side: Side; readonly shot: Shot }): Promise<string[]> {
	const page = await pages.open(shot);
	await page.goto(new URL(shot.path, side.base).href);
	const firstCard = page.getByTestId('first-card');
	await firstCard.waitFor({ timeout: READY_TIMEOUT_MS });
	await expect(firstCard).not.toHaveAttribute('data-state', 'calculating', { timeout: READY_TIMEOUT_MS });
	const cardShown = card === undefined ? undefined : await chooseCard(page, card, shot.path);
	// The camera moves over a new ring and to the chosen point of interest: «before» and «after» are shot where it stops.
	await mapAtRest(page);
	await page.waitForTimeout(wait);
	const screenFile = join(out, `${side.prefix}${shot.name}.png`);
	const files = [screenFile];
	await pages.shoot(page, screenFile);
	const box = await cardShown?.boundingBox();
	if (box !== undefined && box !== null) {
		const cardFile = join(out, `${side.prefix}${shot.name}-card.png`);
		files.push(cardFile);
		// The chosen card's outline is outside its box.
		const margin = 4;
		await page.screenshot({
			path: cardFile,
			clip: { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin },
		});
	}
	await pages.release(page);
	return files;
}

/** Shoots each shot on each side, «before» first, and lists the files on stdout. */
async function shootAll(run: Run, { sides, shots }: { readonly sides: readonly Side[]; readonly shots: readonly Shot[] }): Promise<void> {
	for (const shot of shots) {
		for (const side of sides) {
			const files = await shoot(run, { side, shot });
			process.stdout.write(files.map((file) => `${file}\n`).join(''));
		}
	}
}

/** The demo serving this checkout's build or `dist`, on any free port, so a demo or a test run already up stays where it is. */
async function serve(dist?: string): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
	const server = await startDemo(0, dist);
	const base = server.resolvedUrls?.local[0];
	if (base === undefined) {
		await server.close();
		throw new Error('The demo server has no local URL');
	}
	return { base, close: async () => server.close() };
}

/** Runs a command in `cwd`, its output on stderr, so that stdout lists only the files written. */
function exec(command: string, args: readonly string[], cwd: string): void {
	execFileSync(command, args, { cwd, stdio: ['ignore', process.stderr, process.stderr] });
}

/** Builds the client of git ref `ref` in a worktree of its own: its `dist/`, and the way to remove the worktree. */
function buildAt(ref: string): { readonly dist: string; readonly remove: () => void } {
	const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: import.meta.dirname, encoding: 'utf8' }).trim();
	const dir = join(mkdtempSync(join(tmpdir(), 'roadtrip-shots-')), 'checkout');
	const remove = (): void => {
		spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: root });
		rmSync(dirname(dir), { recursive: true, force: true });
		spawnSync('git', ['worktree', 'prune'], { cwd: root });
	};
	try {
		exec('git', ['worktree', 'add', '--detach', dir, ref], root);
		exec('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], dir);
		exec('pnpm', ['--filter', 'web', 'build'], dir);
	} catch (error) {
		remove();
		throw error;
	}
	return { dist: join(dir, 'web', 'dist'), remove };
}

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		viewport: { type: 'string', default: '390x844' },
		theme: { type: 'string', default: 'light' },
		wait: { type: 'string', default: '0' },
		card: { type: 'string' },
		compare: { type: 'string' },
		title: { type: 'string', default: 'Скриншоты до и после' },
		window: { type: 'boolean', default: false },
	},
});
const [outDir = '', ...linksGiven] = positionals;
const links = linksGiven.length === 0 ? [DEFAULT_LINK] : linksGiven;
const viewports = values.viewport.split(',').map((text) => text.split('x').map(Number));
const themes = themesOf(values.theme);
const wait = Number(values.wait);
if (
	outDir === '' ||
	themes === undefined ||
	!Number.isFinite(wait) ||
	!viewports.every((size) => size.length === 2 && size.every((side) => Number.isInteger(side) && side > 0))
) {
	throw new Error(
		'Usage: pnpm --filter web shots <out-dir> [<link>…] [--viewport <W>x<H>,…] [--theme light|dark|both] [--wait <ms>] [--card <name>] [--compare <ref> [--title <title>]] [--window]',
	);
}

// Paths are the caller's: pnpm runs the script in web/ and says where it was called from.
const out = resolve(process.env.INIT_CWD ?? process.cwd(), outDir);
mkdirSync(out, { recursive: true });
const paths = links.map((link) => (link.includes('/#/') ? link.slice(link.indexOf('/#/')) : link));
const shots: Shot[] = paths.flatMap((path, at) =>
	viewports.flatMap(([width, height]) =>
		themes.map((theme) => ({ link: at + 1, path, width, height, theme, name: `${at + 1}-${width}x${height}-${theme}` })),
	),
);

// The client of `--compare` first: its build is the slow part, and fails before anything is shot.
const before = values.compare === undefined ? undefined : buildAt(values.compare);
try {
	const after = await serve();
	const old =
		before === undefined
			? undefined
			: await serve(before.dist).catch(async (error: unknown) => {
					await after.close();
					throw error;
				});
	const pages = values.window ? await windowPages(viewports.map(([width, height]) => ({ width, height }))) : await headlessPages();
	try {
		const sides: Side[] =
			old === undefined
				? [{ base: after.base, prefix: '' }]
				: [
						{ base: old.base, prefix: 'before-' },
						{ base: after.base, prefix: 'after-' },
					];
		await shootAll({ out, wait, card: values.card, pages }, { sides, shots });
	} finally {
		await pages.close();
		await after.close();
		await old?.close();
	}
} finally {
	before?.remove();
}

if (values.compare !== undefined) {
	const page = join(out, 'index.html');
	writeFileSync(page, comparePage({ title: values.title, ref: values.compare, links: paths, card: values.card, shots }));
	process.stdout.write(`${page}\n`);
}
