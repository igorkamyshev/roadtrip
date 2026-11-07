// The client's build: `dist/` is the Worker roadtrip's static assets (worker/wrangler.jsonc, "assets").
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	build: {
		// MapLibre 6 needs WebGL2 and modern JS anyway; the entry awaits the opening state at the top level.
		target: 'es2022',
		// One screen, one chunk: MapLibre alone is about 0.8 MB of it, React and TanStack the rest.
		chunkSizeWarningLimit: 1600,
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
