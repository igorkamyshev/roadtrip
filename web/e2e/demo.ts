// The screen without the Worker, to look at and record (`pnpm --filter web demo`): the build served by Vite's preview
// server, with the screen tests' doubles of what the Worker serves (e2e/fixtures.ts). `/api/ring` answers a band
// N − 1 to N tenths of a degree around the origin after `RING_DELAY_MS`, so the calculation shows; the cities are
// `CITIES` around Belgrade, the zones `ZONE_OUTLINES`, the tiles empty. PostHog stays off, as on any host but
// production.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { encodeCities } from 'data/cities-file';
import { preview } from 'vite';
import { CITIES, squareRing, ZONE_OUTLINES } from './fixtures.ts';

/** How long the ring double takes to answer. */
const RING_DELAY_MS = 700;

/** The port: `DEMO_PORT`, else the preview server's (vite.config.ts). */
const PORT = process.env.DEMO_PORT === undefined ? undefined : Number(process.env.DEMO_PORT);

function json(response: ServerResponse, body: unknown): void {
	response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

/** Answers what the Worker would, and leaves the rest to the preview server's static files. */
function worker(request: IncomingMessage, response: ServerResponse, next: () => void): void {
	const url = new URL(request.url ?? '/', 'http://demo');
	if (url.pathname === '/api/ring') {
		const hours = Number(url.searchParams.get('hours'));
		const ring = squareRing(Number(url.searchParams.get('lat')), Number(url.searchParams.get('lon')), [(hours - 1) / 10, hours / 10]);
		setTimeout(() => {
			json(response, ring);
		}, RING_DELAY_MS);
	} else if (url.pathname.startsWith('/tiles/')) {
		// An empty vector tile: a basemap with nothing on it.
		response.writeHead(200, { 'content-type': 'application/x-protobuf' }).end();
	} else if (url.pathname === '/data/zones.json') {
		json(response, ZONE_OUTLINES);
	} else if (url.pathname === '/data/cities.json') {
		json(response, encodeCities(CITIES));
	} else {
		next();
	}
}

const server = await preview({
	root: import.meta.dirname + '/..',
	preview: { port: PORT, host: true },
	plugins: [
		{
			name: 'roadtrip:demo-worker',
			configurePreviewServer(previewServer) {
				previewServer.middlewares.use(worker);
			},
		},
	],
});
server.printUrls();
