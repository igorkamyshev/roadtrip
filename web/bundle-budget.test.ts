import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, type PluginOption } from 'vite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { bundleBudget } from './bundle-budget.ts';
import { olderBrowsers } from './older-browsers.ts';

let root: string;

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

/** A module exporting `kb` KB of random text, which gzip cannot shrink: about `kb` KB gzipped. */
function noise(kb: number): string {
	return `export const noise = ${JSON.stringify(randomBytes(kb * 1000).toString('base64'))};\n`;
}

/**
 * Builds the client of `files` (its entry is `main.ts`) under a budget of `budgetKb`; `point.ts`, if any, is a chunk of
 * its own. With `plugins`, the build has those first, as vite.config.ts has olderBrowsers.
 */
async function buildWith(files: Record<string, string>, budgetKb: number, plugins: PluginOption[] = []): Promise<void> {
	for (const [name, text] of Object.entries(files)) {
		writeFileSync(join(root, name), text);
	}
	await build({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [...plugins, bundleBudget(budgetKb)],
		build: {
			write: false,
			rolldownOptions: {
				input: join(root, 'main.ts'),
				output: { manualChunks: (id) => (id.endsWith('point.ts') ? 'point' : undefined) },
			},
		},
	});
}

it('fails the build when the entry is over the budget', async () => {
	await expect(buildWith({ 'main.ts': `${noise(30)}console.log(noise);\n` }, 20)).rejects.toThrow(/over its budget of 20 KB/u);
});

it('leaves out a chunk the entry imports lazily, as the map view after the first paint', async () => {
	const files = { 'main.ts': "void import('./map.ts').then(({ noise }) => console.log(noise));\n", 'map.ts': noise(30) };
	await expect(buildWith(files, 20)).resolves.toBeUndefined();
});

it('counts a chunk the entry imports before it runs, though it is shared with a lazy one', async () => {
	const files = {
		'main.ts': "import { noise } from './point.ts';\nconsole.log(noise);\nvoid import('./map.ts');\n",
		'map.ts': "import { noise } from './point.ts';\nconsole.log(noise.length);\n",
		'point.ts': noise(30),
	};
	await expect(buildWith(files, 20)).rejects.toThrow(/over its budget of 20 KB/u);
});

it('leaves out the polyfills, which only an older browser loads (older-browsers.ts)', async () => {
	const files = { 'main.ts': 'console.log([3, 1, 2].toSorted(), Object.groupBy([1, 2], (n) => n % 2));\n' };
	await expect(buildWith(files, 1, olderBrowsers(['safari >= 15.4']))).resolves.toBeUndefined();
});
