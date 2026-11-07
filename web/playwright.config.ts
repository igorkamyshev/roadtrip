// The screen tests (spec «Решения по тестам», seam 3): the built client in Chromium, `/api/ring` and the tiles
// answered by request interception (e2e/fixtures.ts), geolocation through the context's permissions, time
// through `page.clock`.
import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: 0,
	reporter: process.env.CI ? [['list'], ['github']] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		browserName: 'chromium',
		// A phone: the screen is made for one (spec «Экран»).
		viewport: { width: 390, height: 844 },
		locale: 'ru-RU',
		trace: 'off',
	},
	webServer: {
		// The tests run against the build that the Worker serves, not the dev server.
		command: `pnpm build && pnpm preview --port ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
