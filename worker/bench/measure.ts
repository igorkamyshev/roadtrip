// The measurements of the Container bench (#25, docs/container-bench.md), run by the workflow on the runner:
//
//   node worker/bench/measure.ts worker <bench Worker URL> <token>   cold starts, then warm rings, through the Worker
//   node worker/bench/measure.ts server <engine server URL>          warm rings only, straight to an engine server
//
// Prints one JSON line per request to stdout, and a Markdown summary to $GITHUB_STEP_SUMMARY when set.
import { appendFileSync } from 'node:fs';
import type { Calculation, CalculationRequest } from 'engine/protocol';

/** Central Europe: the worst case for a 12 h ring (spec «Движок»). */
const ORIGINS = {
	Frankfurt: { lat: 50.1109, lon: 8.6821 },
	Munich: { lat: 48.1372, lon: 11.5756 },
	Prague: { lat: 50.0755, lon: 14.4378 },
} as const;
const COLD_STARTS = 3;
const REPEATS = 2;
/** How long a new deploy may take before its first calculation: Cloudflare places the Container application. */
const PROVISIONING_MS = 20 * 60_000;

interface Sample {
	readonly label: string;
	readonly status: number;
	readonly wallMs: number;
	readonly bytes: number;
	readonly outcome?: string;
	readonly timings?: Calculation['timings'];
}

const [mode, base, token] = process.argv.slice(2);
if ((mode !== 'worker' && mode !== 'server') || base === undefined || (mode === 'worker' && token === undefined)) {
	console.error('usage: node worker/bench/measure.ts worker <URL> <token> | server <URL>');
	process.exit(2);
}
const headers: Record<string, string> = { 'content-type': 'application/json', ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) };
const samples: Sample[] = [];

async function ring(label: string, origin: { lat: number; lon: number }, hours: number): Promise<Sample> {
	const request: CalculationRequest = { origin, hours, closedCountries: [] };
	const started = performance.now();
	const response = await fetch(new URL('/ring', base), { method: 'POST', headers, body: JSON.stringify(request) });
	const text = await response.text();
	const wallMs = performance.now() - started;
	let sample: Sample = { label, status: response.status, wallMs, bytes: text.length };
	if (response.ok) {
		const calculation = JSON.parse(text) as Calculation;
		sample = { ...sample, outcome: calculation.outcome, timings: calculation.timings };
	} else {
		sample = { ...sample, outcome: text.slice(0, 300) };
	}
	console.log(JSON.stringify(sample));
	return sample;
}

async function call(method: 'GET' | 'POST', path: string): Promise<unknown> {
	const response = await fetch(new URL(path, base), { method, headers });
	const text = await response.text();
	console.log(JSON.stringify({ call: `${method} ${path}`, status: response.status, body: text.slice(0, 300) }));
	return response.ok ? JSON.parse(text) : undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (mode === 'worker') {
	// A new deploy: wait until Cloudflare has placed the application and a calculation goes through.
	const deployed = performance.now();
	for (;;) {
		const sample = await ring('first after deploy (wall: since the deploy)', ORIGINS.Frankfurt, 1).catch((error: unknown) => {
			console.log(JSON.stringify({ error: String(error) }));
			return undefined;
		});
		if (sample?.status === 200) {
			samples.push({ ...sample, wallMs: performance.now() - deployed });
			break;
		}
		if (sample?.status === 403) {
			throw new Error('The bench Worker refuses the token');
		}
		if (performance.now() - deployed > PROVISIONING_MS) {
			throw new Error(`No calculation went through within ${PROVISIONING_MS / 60_000} min of the deploy`);
		}
		await sleep(10_000);
	}
	for (let start = 1; start <= COLD_STARTS; start++) {
		await call('POST', '/destroy');
		for (let poll = 0; poll < 30; poll++) {
			const state = (await call('GET', '/state')) as { status?: string } | undefined;
			if (state?.status === 'stopped' || state?.status === 'stopped_with_code') {
				break;
			}
			await sleep(2000);
		}
		samples.push(await ring(`cold start ${start}`, ORIGINS.Frankfurt, 1));
	}
}
for (const hours of [1, 2, 3, 6]) {
	for (let repeat = 1; repeat <= REPEATS; repeat++) {
		samples.push(await ring(`Frankfurt ${hours} h`, ORIGINS.Frankfurt, hours));
	}
}
for (const [name, origin] of Object.entries(ORIGINS)) {
	for (let repeat = 1; repeat <= REPEATS; repeat++) {
		samples.push(await ring(`${name} 12 h`, origin, 12));
	}
}

const ms = (value: number | undefined) => (value === undefined ? '' : value.toFixed(0));
const summary = [
	`### ${mode === 'worker' ? 'Through the bench Worker' : 'Straight to the engine server'}: ${base}`,
	'',
	'| Request | Status | Outcome | Cold start, ms | Queue, ms | Traversal, ms | Contour, ms | Wall, ms | Answer, KB |',
	'| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
	...samples.map(
		({ label, status, outcome, timings, wallMs, bytes }) =>
			`| ${label} | ${status} | ${status === 200 ? outcome : ''} | ${ms(timings?.coldStartMs)} | ${ms(timings?.queueMs)} | ` +
			`${ms(timings?.traversalMs)} | ${ms(timings?.contourMs)} | ${ms(wallMs)} | ${(bytes / 1024).toFixed(0)} |`,
	),
	'',
].join('\n');
console.error(summary);
if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
	appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
