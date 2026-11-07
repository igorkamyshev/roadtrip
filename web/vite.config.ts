// The client's build: `dist/` is the Worker roadtrip's static assets (worker/wrangler.jsonc, "assets").
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [react()],
	build: {
		// MapLibre 6 needs WebGL2 and modern JS anyway.
		target: 'es2022',
	},
	preview: {
		port: 4173,
		strictPort: true,
	},
});
