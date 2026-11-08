// What the builder keeps per node and per segment of an extract the size of a part of the world (Europe: ~95 M
// road nodes): typed arrays, outside the JS heap, instead of JS arrays.

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
			values.set(this.values);
			this.values = values;
		}
		this.values[this.length++] = value;
	}

	/** A copy of the values, as long as the column. */
	toArray(): Array {
		const array = this.#make(this.length);
		array.set(this.values.subarray(0, this.length));
		return array;
	}
}
