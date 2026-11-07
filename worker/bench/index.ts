// The Worker of the Container bench (#25, docs/container-bench.md): the Container of the Worker roadtrip, its class
// and its image, behind a temporary Worker on workers.dev that `.github/workflows/container-bench.yml` deploys,
// measures and deletes. It answers only requests with the token the workflow sets at deploy.
//
//   POST /ring      a calculation as the Worker roadtrip posts it; the engine server's answer, timings included
//   POST /destroy   stops the Container, so the next calculation waits for a cold start
//   GET  /state     the Container's state
import { getContainer } from '@cloudflare/containers';
import { CALCULATION_PATH } from 'engine/protocol';
import type { EngineContainer } from '../src/index.ts';

export { EngineContainer } from '../src/index.ts';

interface BenchEnv {
	readonly ENGINE: DurableObjectNamespace<EngineContainer>;
	readonly BENCH_TOKEN: string;
}

export default {
	async fetch(request, env) {
		if (env.BENCH_TOKEN === '' || request.headers.get('authorization') !== `Bearer ${env.BENCH_TOKEN}`) {
			return new Response('Forbidden', { status: 403 });
		}
		const container = getContainer(env.ENGINE);
		const { pathname } = new URL(request.url);
		if (pathname === '/ring' && request.method === 'POST') {
			const body = await request.text();
			return container.fetch(new Request(`http://engine${CALCULATION_PATH}`, { method: 'POST', body, headers: { 'content-type': 'application/json' } }));
		}
		if (pathname === '/destroy' && request.method === 'POST') {
			await container.destroy();
			return Response.json(await container.getState());
		}
		if (pathname === '/state') {
			return Response.json(await container.getState());
		}
		return new Response('Not found', { status: 404 });
	},
} satisfies ExportedHandler<BenchEnv>;
