// The Worker roadtrip (spec «Устройство»): routes a request by its path and builds the route's deps from env and
// ctx. Static assets (#28) are served before the Worker runs, so only paths without a file reach it: GET /api/ring
// and the basemap's tiles, GET /tiles/{z}/{x}/{y}. The class of the Container with the engine lives here too, because the runtime takes
// it from the Worker's entry.
import { Container, getContainer } from '@cloudflare/containers';
import dataset from 'engine/dataset';
import { COLD_START_HEADER } from 'engine/protocol';
import { logger } from 'error-tracking/logger';
import { VISA_EXEMPTIONS } from 'rules';
import { RING_PATH } from './api.ts';
import { handleRing } from './ring.ts';
import { createTilesHandler, TILES_PREFIX } from './tiles.ts';

/**
 * How long the Container may take from its start to an open port, which the engine server opens once the graph is
 * loaded (the library's default is 20 s). A placeholder: #25 measures the cold start with the world's graph and
 * sets it.
 */
const PORT_READY_TIMEOUT_MS = 120_000;

/** The Container with the engine server (engine/server/main.ts). `sleepAfter` stays the default, 10 min (#15). */
export class EngineContainer extends Container<Env> {
	override defaultPort = 8080;
	// The engine reads only its image.
	override enableInternet = false;

	/** Forwards a calculation, starting the Container first if it sleeps and telling the server how long that took. */
	override async fetch(request: Request): Promise<Response> {
		const coldStartMs = await this.startWithGraph(request.signal);
		if (coldStartMs === undefined) {
			return this.containerFetch(request, this.defaultPort);
		}
		const headers = new Headers(request.headers);
		headers.set(COLD_START_HEADER, String(coldStartMs));
		return this.containerFetch(new Request(request, { headers }), this.defaultPort);
	}

	/**
	 * Starts the Container unless it is up, and waits for its port with the raised timeout: the library's own
	 * start in `containerFetch` would wait only 20 s. Resolves with the wait in ms, or undefined when it was up.
	 */
	private async startWithGraph(signal: AbortSignal): Promise<number | undefined> {
		if ((await this.getState()).status === 'healthy') {
			return undefined;
		}
		const started = Date.now();
		await this.startAndWaitForPorts({ cancellationOptions: { portReadyTimeoutMS: PORT_READY_TIMEOUT_MS, abort: signal } });
		return Date.now() - started;
	}
}

/** The tiles route, with the archive's header and directories kept by the isolate between requests. */
const handleTiles = createTilesHandler();

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		if (pathname === RING_PATH) {
			return handleRing(request, {
				rings: {
					get: (key) => env.RINGS.get(key, 'text'),
					put: (key, value, options) => env.RINGS.put(key, value, options),
				},
				visaRules: {
					get: (key) => env.VISA_RULES.get(key, 'text'),
					put: (key, value, options) => env.VISA_RULES.put(key, value, options),
				},
				visaExemptions: VISA_EXEMPTIONS,
				container: getContainer(env.ENGINE),
				datasetVersion: dataset.version,
				fetch: (sherpaRequest) => fetch(sherpaRequest),
				sherpaApiKey: env.SHERPA_API_KEY,
				now: () => Date.now(),
				waitUntil: (promise) => {
					ctx.waitUntil(promise);
				},
				logger,
			});
		}
		if (pathname.startsWith(TILES_PREFIX)) {
			return handleTiles(request, {
				bucket: env.BASEMAP,
				archive: env.BASEMAP_ARCHIVE,
				cache: caches.default,
				waitUntil: (promise) => {
					ctx.waitUntil(promise);
				},
				logger,
			});
		}
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
