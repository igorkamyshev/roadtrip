// OSM node ids by number, for an extract the size of a part of the world (Europe: ~95 M road nodes): a hash table
// in typed arrays, outside the JS heap, instead of a JS Map (2^24 entries at most).

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

	/** The id's number, numbering it next when it is new. */
	add(id: number): number {
		if (this.#size >= this.#keys.length * MAX_LOAD) {
			this.#grow();
		}
		const slot = this.#slot(id);
		const number = this.#numbers[slot];
		if (number !== 0) {
			return number - 1;
		}
		this.#keys[slot] = id;
		this.#numbers[slot] = ++this.#size;
		return this.#size - 1;
	}

	/** The id's number, or −1 when it was never added. */
	get(id: number): number {
		return this.#numbers[this.#slot(id)] - 1;
	}

	/** Forgets every id, letting go of the memory. */
	clear(): void {
		this.#keys = new Float64Array(1024);
		this.#numbers = new Uint32Array(1024);
		this.#size = 0;
	}

	/** The slot that holds the id, or the free one it would take. */
	#slot(id: number): number {
		const mask = this.#keys.length - 1;
		let slot = hash(id) & mask;
		while (this.#numbers[slot] !== 0 && this.#keys[slot] !== id) {
			slot = (slot + 1) & mask;
		}
		return slot;
	}

	#grow(): void {
		const keys = this.#keys;
		const numbers = this.#numbers;
		this.#keys = new Float64Array(keys.length * 2);
		this.#numbers = new Uint32Array(keys.length * 2);
		for (let old = 0; old < keys.length; old++) {
			if (numbers[old] !== 0) {
				// The ids are distinct, so the slot is a free one.
				const slot = this.#slot(keys[old]);
				this.#keys[slot] = keys[old];
				this.#numbers[slot] = numbers[old];
			}
		}
	}
}

/** A 32-bit hash of an integer id below 2^53 in magnitude, from both its 32-bit halves. */
function hash(id: number): number {
	const low = id >>> 0;
	// Below 2^21 in magnitude, so Math.imul takes it as it is.
	const high = Math.floor(id / 0x1_0000_0000);
	let value = Math.imul(low ^ Math.imul(high, 0x9e3779b1), 0x85ebca6b);
	value ^= value >>> 13;
	value = Math.imul(value, 0xc2b2ae35);
	return (value ^ (value >>> 16)) >>> 0;
}
