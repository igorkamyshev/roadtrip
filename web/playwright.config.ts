// The screen tests (spec «Решения по тестам», seam 3): the built client in Chromium, `/api/ring` and the tiles
// answered by request interception (e2e/fixtures.ts), geolocation through the context's permissions, time
// through `page.clock`.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { defineConfig, type ReporterDescription } from '@playwright/test';
import { OFFLINE } from './e2e/offline.ts';

/**
 * The preview server's port: `E2E_PORT`, else one of 20000–29999 that this checkout takes from its path, the same on
 * every run. Checkouts on one machine (agents' worktrees) then test their own builds at the same time.
 */
const E2E_PORT = process.env.E2E_PORT ?? '';
const PORT =
	E2E_PORT === ''
		? 20_000 +
			(createHash('sha256')
				.update(import.meta.dirname)
				.digest()
				.readUInt32BE(0) %
				10_000)
		: Number(E2E_PORT);

/**
 * The list in the console; every failure in full in test-results/failures.md (e2e/failures.ts). On GitHub Actions,
 * its annotations too: by GITHUB_ACTIONS, not CI, so that CI=1 at home prints the same.
 */
const reporter: ReporterDescription[] = [
	['list'],
	['./e2e/failures.ts', { outputFile: join(import.meta.dirname, 'test-results', 'failures.md') }],
];
if (process.env.GITHUB_ACTIONS === 'true') {
	reporter.push(['github']);
}

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	reporter,
	use: {
		baseURL: `http://localhost:${PORT}`,
		browserName: 'chromium',
		// A phone: the screen is made for one (spec «Экран»).
		viewport: { width: 390, height: 844 },
		locale: 'ru-RU',
		trace: 'off',
		// Nothing a test runs reaches the network, PostHog's beacons included (e2e/offline.ts).
		proxy: OFFLINE,
	},
	webServer: {
		// The tests run against the build that the Worker serves, not the dev server: this checkout's, built now.
		command: `pnpm build && pnpm preview --port ${PORT}`,
		url: `http://localhost:${PORT}`,
		// A server already on the port is never taken for ours: it may be another checkout's build, or an old one. The
		// run fails instead; stop that server, or give another port with E2E_PORT.
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
