// The thread that holds the graph and the border table and runs the engine, one calculation per message, so the
// server's own thread stays free to take requests while a ring is calculated: it queues them, sees those for a ring
// being calculated and answers the Container's pings. Started by calculator.ts.
import { readFileSync } from 'node:fs';
import { parentPort, workerData } from 'node:worker_threads';
import { borderTable } from 'rules';
import { computeRing } from '../src/index.ts';
import { decodeGraph } from '../src/graph.ts';
import { isRecord } from '../src/json.ts';
import { calculationFailure, type CalculationRequest } from '../src/protocol.ts';

export interface ThreadData {
	readonly graphPath: string;
}

export type ThreadMessage =
	| { readonly type: 'loaded'; readonly loadMs: number; readonly nodes: number; readonly edges: number }
	| { readonly type: 'calculated'; readonly id: number; readonly result: ReturnType<typeof computeRing> }
	| { readonly type: 'failed'; readonly id: number; readonly failure: ReturnType<typeof calculationFailure> };

const port = parentPort;
const data: unknown = workerData;
if (port === null || !isThreadData(data)) {
	throw new Error('compute-thread.ts runs as a worker thread of calculator.ts, with its ThreadData');
}
const started = performance.now();
const graph = decodeGraph(readFileSync(data.graphPath));
port.postMessage({
	type: 'loaded',
	loadMs: performance.now() - started,
	nodes: graph.nodeLat.length,
	edges: graph.edgeTarget.length,
} satisfies ThreadMessage);

port.on('message', ({ id, request }: { id: number; request: CalculationRequest }) => {
	try {
		port.postMessage({ type: 'calculated', id, result: computeRing(graph, borderTable, request) } satisfies ThreadMessage);
	} catch (error) {
		port.postMessage({ type: 'failed', id, failure: calculationFailure(error) } satisfies ThreadMessage);
	}
});

function isThreadData(value: unknown): value is ThreadData {
	return isRecord(value) && typeof value.graphPath === 'string';
}
