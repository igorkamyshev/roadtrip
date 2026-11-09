// The Worker roadtrip (spec #20 «Устройство»): routes a request by its path and builds the route's deps from env and
// ctx. Static assets (#28) are served before the Worker runs, so only paths without a file reach it: GET /api/ring
// and the basemap's tiles, GET /tiles/{z}/{x}/{y}. The class of the Container with the engine lives here too, because the runtime takes
// it from the Worker's entry.
import { Container, getContainer } from '@cloudflare/containers';
import dataset from 'engine/dataset';
import { COLD_START_HEADER } from 'engine/protocol';
import { logger } from 'error-tracking/logger';
import { VISA_EXEMPTIONS } from 'rules';
import { requestAnalytics } from './analytics.ts';
import { RING_PATH } from './api.ts';
import { handleRing } from './ring.ts';
import { createTilesHandler, TILES_PREFIX } from './tiles.ts';

/**
 * How long a start may wait for Cloudflare to give the Container an instance (the library's default is 8 s). With
 * `max_instances: 1`, a start right after the Container stopped waits until the old instance is released: up to
 * 27 s in the bench of #25 (docs/container-bench.md), where 2 starts of 12 failed after the default 8 s.
 */
const INSTANCE_GET_TIMEOUT_MS = 30_000;

/**
 * How long a start may take in all, to the open port (the library's default is 20 s): the tries for an instance
 * above count here too, then the engine server opens its port once the graph is loaded. With Europe's graph that
 * took 0.7–1.6 s from the process's start, and the slowest whole start 27 s (#25, docs/container-bench.md).
 */
const PORT_READY_TIMEOUT_MS = 60_000;

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
	 * Starts the Container unless it is up, and waits for an instance and its port with the raised timeouts: the
	 * library's own start in `containerFetch` would wait only 8 s and 20 s. Resolves with the wait in ms, or undefined
	 * when it was up.
	 */
	private async startWithGraph(signal: AbortSignal): Promise<number | undefined> {
		if ((await this.getState()).status === 'healthy') {
			return undefined;
		}
		const started = Date.now();
		await this.startAndWaitForPorts({
			cancellationOptions: { instanceGetTimeoutMS: INSTANCE_GET_TIMEOUT_MS, portReadyTimeoutMS: PORT_READY_TIMEOUT_MS, abort: signal },
		});
		return Date.now() - started;
	}
}

/** The tiles route, with the archive's header and directories kept by the isolate between requests. */
const handleTiles = createTilesHandler();

/** The citizenships whose stale visa rules a request of this isolate is refreshing. */
const refreshing = new Set<string>();

export default {
	async fetch(request, env, ctx) {
		const { pathname } = new URL(request.url);
		// A wrapper, not ctx.waitUntil itself: called as a method of deps it would lose its `this`.
		const waitUntil = (promise: Promise<unknown>) => {
			ctx.waitUntil(promise);
		};
		if (pathname === RING_PATH) {
			const analytics = requestAnalytics(request, { token: env.POSTHOG_API_KEY, waitUntil });
			const response = await handleRing(request, {
				rings: env.RINGS,
				visaRules: env.VISA_RULES,
				refreshing,
				visaExemptions: VISA_EXEMPTIONS,
				container: getContainer(env.ENGINE),
				datasetVersion: dataset.version,
				fetch: (sherpaRequest) => fetch(sherpaRequest),
				sherpaApiKey: env.SHERPA_API_KEY,
				now: () => Date.now(),
				sleep: (ms) =>
					new Promise((resolve) => {
						setTimeout(resolve, ms);
					}),
				waitUntil,
				logger,
				analytics,
			});
			analytics.shutdown();
			return response;
		}
		if (pathname.startsWith(TILES_PREFIX)) {
			return handleTiles(request, {
				bucket: env.BASEMAP,
				archive: env.BASEMAP_ARCHIVE,
				cache: caches.default,
				waitUntil,
				logger,
			});
		}
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
