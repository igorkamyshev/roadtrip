/**
 * A binary min-heap of nodes by key, in typed arrays. A node is pushed again when its key drops; the caller
 * skips the stale entry when it pops (lazy deletion), which is cheaper than a decrease-key.
 */
export class NodeHeap {
	#keys = new Float64Array(1024);
	#nodes = new Uint32Array(1024);
	#size = 0;

	get size(): number {
		return this.#size;
	}

	/** The smallest key; the heap must not be empty. */
	get topKey(): number {
		return this.#keys[0];
	}

	/** The node with the smallest key; the heap must not be empty. */
	get topNode(): number {
		return this.#nodes[0];
	}

	push(node: number, key: number): void {
		if (this.#size === this.#keys.length) {
			this.#grow();
		}
		const keys = this.#keys;
		const nodes = this.#nodes;
		let slot = this.#size++;
		while (slot > 0) {
			const parent = (slot - 1) >> 1;
			if (keys[parent] <= key) {
				break;
			}
			keys[slot] = keys[parent];
			nodes[slot] = nodes[parent];
			slot = parent;
		}
		keys[slot] = key;
		nodes[slot] = node;
	}

	/** Removes the top entry; the heap must not be empty. */
	pop(): void {
		const keys = this.#keys;
		const nodes = this.#nodes;
		const size = --this.#size;
		const key = keys[size];
		const node = nodes[size];
		let slot = 0;
		for (;;) {
			let child = 2 * slot + 1;
			if (child >= size) {
				break;
			}
			if (child + 1 < size && keys[child + 1] < keys[child]) {
				child++;
			}
			if (keys[child] >= key) {
				break;
			}
			keys[slot] = keys[child];
			nodes[slot] = nodes[child];
			slot = child;
		}
		keys[slot] = key;
		nodes[slot] = node;
	}

	#grow(): void {
		const keys = new Float64Array(this.#keys.length * 2);
		keys.set(this.#keys);
		this.#keys = keys;
		const nodes = new Uint32Array(this.#nodes.length * 2);
		nodes.set(this.#nodes);
		this.#nodes = nodes;
	}
}
