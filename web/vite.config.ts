// The client's build: `dist/` is the Worker roadtrip's static assets (worker/wrangler.jsonc, "assets").
import { execFileSync } from 'node:child_process';
import posthog from '@posthog/rollup-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, type PluginOption } from 'vite';

/**
 * PostHog's source maps (spec «Аналитика и ошибки», «Браузер»), so that the stack of an error in the browser reads as
 * the source. Workers Builds gives the build two variables: `POSTHOG_PERSONAL_API_KEY`, a secret (the Owner's
 * personal key, `phx_…`, with «error tracking: write»), and `POSTHOG_PROJECT_ID` (718601). With both, the plugin
 * writes a chunk id into each JS file, uploads its source map under the release of this commit's git SHA and removes
 * the map from `dist/`: deploy exactly that `dist/`. Without them (a local build, CI, the screen tests) the plugin is
 * left out, and the build is as any other and uploads nothing.
 */
function sourceMaps(env: NodeJS.ProcessEnv): PluginOption {
	const personalApiKey = env.POSTHOG_PERSONAL_API_KEY?.trim();
	const projectId = env.POSTHOG_PROJECT_ID?.trim();
	if (!personalApiKey || !projectId) {
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
	plugins: [react(), sourceMaps(process.env)],
	build: {
		// MapLibre 6 needs WebGL2 and modern JS anyway; the entry awaits the opening state at the top level.
		target: 'es2022',
		// The screen is 0.42 MB (132 KB gzip); its two chunks of its own come after the first paint: the map view with
		// MapLibre and the basemap's style, 1.1 MB (297 KB gzip), and posthog-js on the production host, 0.37 MB.
		chunkSizeWarningLimit: 1200,
	},
	server: {
		// `pnpm dev` of the worker (wrangler dev) answers the ring.
		proxy: { '/api': 'http://localhost:8787' },
	},
	preview: {
		port: 4173,
		strictPort: true,
	},
});
