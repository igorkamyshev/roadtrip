// The budget of the client's first paint: the build fails when the JavaScript the page loads before it runs, the entry
// chunk and the chunks it imports statically, is over the budget gzipped. The budget itself is in vite.config.ts.
import { gzipSync } from 'node:zlib';
import type { Plugin, Rollup } from 'vite';

type OutputBundle = Rollup.OutputBundle;
type OutputChunk = Rollup.OutputChunk;

/** The entry chunk of `bundle` and every chunk it imports statically, at any depth: what loads before it runs. */
function firstPaintChunks(bundle: OutputBundle): OutputChunk[] {
	const chunks = new Map(Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? [[output.fileName, output]] : [])));
	const loaded = new Set<OutputChunk>();
	const pending = [...chunks.values()].filter((chunk) => chunk.isEntry);
	for (let chunk = pending.pop(); chunk !== undefined; chunk = pending.pop()) {
		loaded.add(chunk);
		pending.push(...chunk.imports.flatMap((name) => chunks.get(name) ?? []).filter((imported) => !loaded.has(imported)));
	}
	return [...loaded];
}

/** A plugin of the build that fails it when the first paint's JavaScript is over `budgetKb` KB (1000 bytes) gzipped. */
export function bundleBudget(budgetKb: number): Plugin {
	return {
		name: 'roadtrip:bundle-budget',
		apply: 'build',
		generateBundle(_options, bundle) {
			const chunks = firstPaintChunks(bundle);
			const kb = chunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0) / 1000;
			if (kb > budgetKb) {
				const names = chunks.map((chunk) => chunk.fileName).join(', ');
				this.error(
					`The entry chunk and the chunks it imports statically (${names}) are ${kb.toFixed(1)} KB gzipped, over its budget of ${budgetKb} KB.`,
				);
			}
		},
	};
}
