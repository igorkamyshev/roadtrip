// The engine in its own thread (compute-thread.ts): loads the graph there and calculates rings by messages.
import { Worker } from 'node:worker_threads';
import type { RingResult } from '../src/index.ts';
import type { CalculationFailure, CalculationRequest } from '../src/protocol.ts';
import type { ThreadData, ThreadMessage } from './compute-thread.ts';

export interface Calculator {
	readonly calculate: (request: CalculationRequest) => Promise<RingResult>;
	/** Loading the graph, in ms. */
	readonly loadMs: number;
	readonly nodes: number;
	readonly edges: number;
	/** Resolves with the error once the thread has died: no calculation can run after it. */
	readonly died: Promise<Error>;
}

/** Starts the thread and resolves once it has loaded the graph at `graphPath`. */
export async function startCalculator(graphPath: string): Promise<Calculator> {
	const thread = new Worker(new URL('compute-thread.ts', import.meta.url), { workerData: { graphPath } satisfies ThreadData });
	const running = new Map<number, { resolve: (result: RingResult) => void; reject: (error: Error) => void }>();
	let nextId = 0;
	let death: Error | undefined;

	const died = new Promise<Error>((resolve) => {
		const die = (error: Error) => {
			if (death !== undefined) {
				return;
			}
			death = error;
			for (const { reject } of running.values()) {
				reject(error);
			}
			running.clear();
			resolve(error);
		};
		thread.on('error', die);
		thread.on('exit', (code) => {
			die(new Error(`The engine's thread exited with code ${code}`));
		});
	});

	const loaded = await new Promise<Extract<ThreadMessage, { type: 'loaded' }>>((resolve, reject) => {
		thread.once('message', resolve);
		void died.then(reject);
	});

	thread.on('message', (message: ThreadMessage) => {
		if (message.type === 'loaded') {
			return;
		}
		const calculation = running.get(message.id);
		running.delete(message.id);
		if (message.type === 'calculated') {
			calculation?.resolve(message.result);
		} else {
			calculation?.reject(rebuild(message.failure));
		}
	});

	return {
		calculate: (request) =>
			new Promise((resolve, reject) => {
				if (death !== undefined) {
					reject(death);
					return;
				}
				const id = nextId++;
				running.set(id, { resolve, reject });
				thread.postMessage({ id, request });
			}),
		loadMs: loaded.loadMs,
		nodes: loaded.nodes,
		edges: loaded.edges,
		died,
	};
}

/** The thread's error as an Error again, with its own name, message and stack. */
function rebuild({ name, message, stack }: CalculationFailure): Error {
	return Object.assign(new Error(message), { name, stack });
}
