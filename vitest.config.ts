import { configDefaults, defineConfig } from 'vitest/config';

// One run at the root covers the tests of every package. Agent worktrees live under .claude/ with their own
// copies of the tests, which are not this checkout's. The screen's tests are Playwright's (web/e2e, `pnpm e2e`).
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, '.claude/**', 'web/e2e/**'],
	},
});
