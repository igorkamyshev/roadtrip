// The overlay's images drawn pixel by pixel (overlay.ts, place-layers.ts), as MapLibre's `addImage` takes them.

/** A square image `size` pixels across, RGBA. */
export interface SquareImage {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8Array;
}

/** A square image `size` pixels across whose pixel (x, y) is the RGBA `pixel` gives. */
export function squareImage(size: number, pixel: (x: number, y: number) => readonly number[]): SquareImage {
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			data.set(pixel(x, y), (y * size + x) * 4);
		}
	}
	return { width: size, height: size, data };
}
