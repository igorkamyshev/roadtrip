// The client's build: `dist/` is the Worker roadtrip's static assets (worker/wrangler.jsonc, "assets").
import { execFileSync } from 'node:child_process';
import posthog from '@posthog/rollup-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';
import { bundleBudget } from './bundle-budget.ts';
import { olderBrowsers } from './older-browsers.ts';

/**
 * What the first paint may load, the entry chunk and the chunks it imports statically, in KB gzipped: 136 KB on
 * 2026-11-08 (the screen, 132 KB, and the chunk it shares with the map view, 4 KB), and about a fifth more. The map
 * view with MapLibre and the basemap's style (297 KB) and posthog-js (124 KB) are chunks of their own, after it.
 */
const FIRST_PAINT_BUDGET_KB = 165;

/**
 * The oldest browsers the screen supports, those MapLibre 6 runs in: its worker calls `.at()` and `Object.hasOwn`
 * (Safari 15.4). The build lowers the syntax to them, and they get the polyfills of what the client uses and they lack.
 */
const BROWSERS = ['chrome >= 93', 'edge >= 93', 'firefox >= 92', 'safari >= 15.4', 'ios_saf >= 15.4'];

/**
 * PostHog's source maps (spec #20 «Аналитика и ошибки», «Браузер»), so that the stack of an error in the browser reads
 * as the source. Workers Builds gives the build two variables: `POSTHOG_PERSONAL_API_KEY`, a secret (the Owner's
 * personal key, `phx_…`, with «error tracking: write»), and `POSTHOG_PROJECT_ID` (718601). With both, the plugin
 * writes a chunk id into each JS file, uploads its source map under the release of this commit's git SHA and removes
 * the map from `dist/`: deploy exactly that `dist/`. Without them (a local build, CI, the screen tests) the plugin is
 * left out, and the build is as any other and uploads nothing.
 */
function sourceMaps(env: NodeJS.ProcessEnv): PluginOption {
	const personalApiKey = env.POSTHOG_PERSONAL_API_KEY?.trim() ?? '';
	const projectId = env.POSTHOG_PROJECT_ID?.trim() ?? '';
	if (personalApiKey === '' || projectId === '') {
		return undefined;
	}
	return posthog({
		personalApiKey,
		projectId,
		sourcemaps: {
			enabled: true,
			releaseName: 'roadtrip-web',
			// Workers Builds names the commit it builds; elsewhere, the checkout's.
			releaseVersion: env.WORKERS_CI_COMMIT_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
			deleteAfterUpload: true,
		},
	});
}

export default defineConfig({
	plugins: [react(), olderBrowsers(BROWSERS), sourceMaps(process.env), bundleBudget(FIRST_PAINT_BUDGET_KB)],
	server: {
		// `pnpm dev` of the worker (wrangler dev) answers the ring.
		proxy: { '/api': 'http://localhost:8787' },
	},
	preview: {
		port: 4173,
		strictPort: true,
	},
});
