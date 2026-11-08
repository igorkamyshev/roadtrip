// The road nodes at a junction of an extract the size of the world (#35): the ids that its road ways refer to more
// than once, found among more ids than fit a hash table in memory.
import { NodeIds } from './node-ids.ts';

/** The most ids a chunk of `RepeatedIds` holds: 128 MB. */
const CHUNK_IDS = 1 << 24;

/**
 * Finds the ids added more than once, among more than fit a hash table in memory (the world's road ways refer to
 * ~360 M node ids, Europe's to ~100 M): 8 bytes an id, in chunks each sorted once full, merged at the end.
 */
export class RepeatedIds {
	readonly #sorted: Float64Array[] = [];
	#chunk = new Float64Array(1024);
	#length = 0;

	add(id: number): void {
		if (this.#length === this.#chunk.length) {
			if (this.#chunk.length < CHUNK_IDS) {
				const chunk = new Float64Array(this.#chunk.length * 2);
				chunk.set(this.#chunk);
				this.#chunk = chunk;
			} else {
				// oxlint-disable-next-line unicorn/no-array-sort -- sorts a full chunk of 128 MB in place; toSorted would copy it
				this.#sorted.push(this.#chunk.sort());
				this.#chunk = new Float64Array(CHUNK_IDS);
				this.#length = 0;
			}
		}
		this.#chunk[this.#length++] = id;
	}

	/** The ids added more than once, numbered in ascending order. The ids added are let go. */
	repeated(): NodeIds {
		// oxlint-disable-next-line unicorn/no-array-sort -- sorts the last chunk, up to 128 MB, in place; toSorted would copy it
		const chunks = [...this.#sorted, this.#chunk.subarray(0, this.#length).sort()].filter((chunk) => chunk.length > 0);
		this.#sorted.length = 0;
		this.#chunk = new Float64Array(0);
		this.#length = 0;
		const repeated = new NodeIds();
		// A k-way merge of the sorted chunks: a binary heap of the chunks by their next id.
		const next = new Uint32Array(chunks.length);
		const heap = chunks.map((_, index) => index);
		const head = (slot: number) => chunks[heap[slot]][next[heap[slot]]];
		const siftDown = (from: number) => {
			for (let slot = from; ;) {
				const left = 2 * slot + 1;
				let least = slot;
				if (left < heap.length && head(left) < head(least)) {
					least = left;
				}
				if (left + 1 < heap.length && head(left + 1) < head(least)) {
					least = left + 1;
				}
				if (least === slot) {
					return;
				}
				[heap[slot], heap[least]] = [heap[least], heap[slot]];
				slot = least;
			}
		};
		for (let slot = Math.floor(heap.length / 2) - 1; slot >= 0; slot--) {
			siftDown(slot);
		}
		let previous = Number.NaN;
		while (heap.length > 0) {
			const chunk = heap[0];
			const id = chunks[chunk][next[chunk]++];
			if (id === previous) {
				repeated.add(id);
			}
			previous = id;
			if (next[chunk] === chunks[chunk].length) {
				// The chunk is done: the heap's last takes its place.
				const last = heap.pop();
				if (last !== undefined && heap.length > 0) {
					heap[0] = last;
				}
			}
			siftDown(0);
		}
		return repeated;
	}
}
