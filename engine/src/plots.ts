// The small plots of land without roads that the reached roads wall in, which the ring takes in (spec «Движок»,
// «Кольцо»; #43): the holes of a raster of cells smaller than a given area, filled.

/** The raster's shape, and the area of a cell of each row: cells narrow away from the equator. */
export interface PlotRaster {
	readonly columns: number;
	readonly rows: number;
	readonly rowCellSquareMeters: Float64Array;
}

const OUTSIDE = 0;
const INSIDE = 1;
/** An OUTSIDE cell a walk has reached. */
const SEEN = 2;

/**
 * Turns to 1 every plot of 0 cells that is smaller than `maxSquareMeters` and does not reach the raster's edge.
 * A plot's cells are joined by their eight neighbours: marching squares (trace.ts) keep apart the cells of 1 that
 * touch only at a corner, so a plot is open through such a corner.
 */
export function fillSmallPlots(cells: Uint8Array, raster: PlotRaster, maxSquareMeters: number): void {
	const walk = new PlotWalk(cells, raster, maxSquareMeters);
	for (let start = 0; start < cells.length; start++) {
		if (cells[start] === OUTSIDE) {
			walk.fillFrom(start);
		}
	}
	for (let cell = 0; cell < cells.length; cell++) {
		if (cells[cell] === SEEN) {
			cells[cell] = OUTSIDE;
		}
	}
}

/** A walk over the cells of one plot at a time, from a cell of it to its neighbours. */
class PlotWalk {
	readonly #cells: Uint8Array;
	readonly #columns: number;
	readonly #rows: number;
	readonly #rowCellSquareMeters: Float64Array;
	readonly #maxSquareMeters: number;
	/** The cells of the plot whose neighbours are still to be looked at. */
	readonly #stack: number[] = [];
	/** The cells of the plot, while it is small. */
	readonly #plot: number[] = [];
	#squareMeters = 0;
	#small = true;

	constructor(cells: Uint8Array, raster: PlotRaster, maxSquareMeters: number) {
		this.#cells = cells;
		this.#columns = raster.columns;
		this.#rows = raster.rows;
		this.#rowCellSquareMeters = raster.rowCellSquareMeters;
		this.#maxSquareMeters = maxSquareMeters;
	}

	/** Walks the plot of the OUTSIDE cell `start`, leaving its cells SEEN, or INSIDE when it is small. */
	fillFrom(start: number): void {
		this.#begin(start);
		for (let cell = this.#stack.pop(); cell !== undefined; cell = this.#stack.pop()) {
			this.#walkTo(cell);
		}
		if (this.#small) {
			for (const cell of this.#plot) {
				this.#cells[cell] = INSIDE;
			}
		}
	}

	#begin(start: number): void {
		this.#squareMeters = 0;
		this.#small = true;
		this.#plot.length = 0;
		this.#cells[start] = SEEN;
		this.#stack.push(start);
	}

	/** Adds the cell to the plot, and queues its OUTSIDE neighbours. */
	#walkTo(cell: number): void {
		const columns = this.#columns;
		const row = Math.floor(cell / columns);
		const column = cell - row * columns;
		this.#squareMeters += this.#rowCellSquareMeters[row];
		const atEdge = row === 0 || column === 0 || row === this.#rows - 1 || column === columns - 1;
		this.#small &&= !atEdge && this.#squareMeters < this.#maxSquareMeters;
		if (this.#small) {
			this.#plot.push(cell);
		}
		for (let nextRow = Math.max(0, row - 1); nextRow <= Math.min(this.#rows - 1, row + 1); nextRow++) {
			this.#queueOutside(nextRow * columns, column);
		}
	}

	/** Queues the OUTSIDE cells of the row that starts at `rowStart`, from column `column` − 1 to `column` + 1. */
	#queueOutside(rowStart: number, column: number): void {
		for (let next = Math.max(0, column - 1); next <= Math.min(this.#columns - 1, column + 1); next++) {
			if (this.#cells[rowStart + next] === OUTSIDE) {
				this.#cells[rowStart + next] = SEEN;
				this.#stack.push(rowStart + next);
			}
		}
	}
}
