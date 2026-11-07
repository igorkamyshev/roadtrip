import { configDefaults, defineConfig } from 'vitest/config';

// One run at the root covers the tests of every package. Agent worktrees live under .claude/ with their own
// copies of the tests, which are not this checkout's.
export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, '.claude/**'],
	},
});
