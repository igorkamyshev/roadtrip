// The road segments the builder cuts the ways into (pieces.ts) and joins into the graph's edges (collapse.ts), in
// typed arrays outside the JS heap.
import { Column } from './column.ts';

/** A segment may be driven from its end `a` to its end `b`. */
export const FORWARD = 1;
/** A segment may be driven from its end `b` to its end `a`. */
export const BACKWARD = 2;

/** Road segments between two nodes, with their driving time and the directions allowed. */
export class Segments {
	readonly #a = new Column((length) => new Uint32Array(length));
	readonly #b = new Column((length) => new Uint32Array(length));
	readonly #seconds = new Column((length) => new Float64Array(length));
	readonly #directions = new Column((length) => new Uint8Array(length));

	get count(): number {
		return this.#a.length;
	}

	get a(): Uint32Array {
		return this.#a.values;
	}

	get b(): Uint32Array {
		return this.#b.values;
	}

	// oxlint-disable-next-line eslint/max-params -- once per piece of the world's road ways: plain numbers, no object to allocate per call
	add(a: number, b: number, seconds: number, directions: number): void {
		this.#a.push(a);
		this.#b.push(b);
		this.#seconds.push(seconds);
		this.#directions.push(directions);
	}

	/** The driving time of a segment leaving `from`, one of its ends, or −1 when that direction is not allowed. */
	seconds(segment: number, from: number): number {
		const direction = this.#a.values[segment] === from ? FORWARD : BACKWARD;
		return (this.#directions.values[segment] & direction) === 0 ? -1 : this.#seconds.values[segment];
	}
}
