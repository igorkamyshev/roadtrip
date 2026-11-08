// What the builder keeps per node and per segment of an extract the size of a part of the world (Europe: ~95 M
// road nodes): typed arrays, outside the JS heap, instead of a JS Map (2^24 entries at most) and JS arrays.

/** The typed arrays a `Column` grows. */
type Values = Int32Array | Uint32Array | Uint16Array | Uint8Array | Float64Array;

/** A typed array that grows as values are pushed. `values` is the array itself, longer than `length`. */
export class Column<Array extends Values> {
	values: Array;
	length = 0;
	readonly #make: (length: number) => Array;

	constructor(make: (length: number) => Array, capacity = 1024) {
		this.#make = make;
		this.values = make(Math.max(1, capacity));
	}

	push(value: number): void {
		if (this.length === this.values.length) {
			const values = this.#make(this.values.length * 2);
			values.set(this.values as never);
			this.values = values;
		}
		this.values[this.length++] = value;
	}

	/** A copy of the values, as long as the column. */
	toArray(): Array {
		return this.values.slice(0, this.length) as Array;
	}
}

/** Hash table slots per id at most, before it doubles. */
const MAX_LOAD = 0.7;

/**
 * OSM node ids numbered as first added: 0, 1, 2… An open-addressing hash table in typed arrays, for any integer id
 * up to 2^53 in magnitude.
 */
export class NodeIds {
	#keys = new Float64Array(1024);
	/** The number of each id plus one; 0 marks a free slot. */
	#numbers = new Uint32Array(1024);
	#size = 0;

	get size(): number {
		return this.#size;
	}

	/** The id's number, numbering it next when it is new. */
	add(id: number): number {
		if (this.#size >= this.#keys.length * MAX_LOAD) {
			this.#grow();
		}
		const mask = this.#keys.length - 1;
		for (let slot = hash(id) & mask; ; slot = (slot + 1) & mask) {
			const number = this.#numbers[slot];
			if (number === 0) {
				this.#keys[slot] = id;
				this.#numbers[slot] = ++this.#size;
				return this.#size - 1;
			}
			if (this.#keys[slot] === id) {
				return number - 1;
			}
		}
	}

	/** The id's number, or −1 when it was never added. */
	get(id: number): number {
		const mask = this.#keys.length - 1;
		for (let slot = hash(id) & mask; ; slot = (slot + 1) & mask) {
			const number = this.#numbers[slot];
			if (number === 0) {
				return -1;
			}
			if (this.#keys[slot] === id) {
				return number - 1;
			}
		}
	}

	/** Forgets every id, letting go of the memory. */
	clear(): void {
		this.#keys = new Float64Array(1024);
		this.#numbers = new Uint32Array(1024);
		this.#size = 0;
	}

	#grow(): void {
		const keys = this.#keys;
		const numbers = this.#numbers;
		this.#keys = new Float64Array(keys.length * 2);
		this.#numbers = new Uint32Array(keys.length * 2);
		const mask = this.#keys.length - 1;
		for (let old = 0; old < keys.length; old++) {
			if (numbers[old] !== 0) {
				let slot = hash(keys[old]) & mask;
				while (this.#numbers[slot] !== 0) {
					slot = (slot + 1) & mask;
				}
				this.#keys[slot] = keys[old];
				this.#numbers[slot] = numbers[old];
			}
		}
	}
}

/** A 32-bit hash of an integer id below 2^53 in magnitude, from both its 32-bit halves. */
function hash(id: number): number {
	const low = id >>> 0;
	const high = Math.floor(id / 0x1_0000_0000) | 0;
	let value = Math.imul(low ^ Math.imul(high, 0x9e3779b1), 0x85ebca6b);
	value ^= value >>> 13;
	value = Math.imul(value, 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}

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
				this.#sorted.push(this.#chunk.sort());
				this.#chunk = new Float64Array(CHUNK_IDS);
				this.#length = 0;
			}
		}
		this.#chunk[this.#length++] = id;
	}

	/** The ids added more than once, numbered in ascending order. The ids added are let go. */
	repeated(): NodeIds {
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
			for (let slot = from; ; ) {
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
				heap[0] = heap[heap.length - 1];
				heap.pop();
			}
			siftDown(0);
		}
		return repeated;
	}
}
