// The cells of the ring traced into GeoJSON polygons (spec #20 «Движок», «Кольцо»): marching squares over the cell
// centres, holes (large plots without roads, closed zones, the land reached sooner) put in the outer rings around
// them, and every ring simplified by Douglas–Peucker.
import { type CellGrid, E7 } from './geo.ts';

/** The sides of a square of four cell centres, where a contour crosses it at the side's midpoint. */
const BOTTOM = 0;
const RIGHT = 1;
const TOP = 2;
const LEFT = 3;
/** The midpoint of each side in doubled lattice coordinates, from the square's south-west corner. */
const SIDE_X2 = [1, 2, 1, 0];
const SIDE_Y2 = [0, 1, 2, 1];

/**
 * The segments of each marching-squares case, as the sides they run from and to, one pair after another; corner
 * bits: 1 south-west, 2 south-east, 4 north-east, 8 north-west.
 */
const SEGMENTS: readonly (readonly number[])[] = [
	[],
	[BOTTOM, LEFT],
	[RIGHT, BOTTOM],
	[RIGHT, LEFT],
	[TOP, RIGHT],
	[BOTTOM, LEFT, TOP, RIGHT],
	[TOP, BOTTOM],
	[TOP, LEFT],
	[LEFT, TOP],
	[BOTTOM, TOP],
	[RIGHT, BOTTOM, LEFT, TOP],
	[RIGHT, TOP],
	[LEFT, RIGHT],
	[BOTTOM, RIGHT],
	[LEFT, BOTTOM],
	[],
];

/**
 * Marching squares over the cell centres. A contour runs through the midpoints between an inside and an outside
 * centre, with the inside on its left: outer rings come out counter-clockwise, holes clockwise. Cells that touch
 * only at a corner are apart, so the outside runs on between them: a hole is a plot of outside cells joined by their
 * eight neighbours (plots.ts). A point is a key over doubled lattice coordinates, so midpoints are integers.
 */
export function traceRings(inside: Uint8Array, columns: number, rows: number): number[][] {
	const height = 2 * rows + 5;
	const key = (x2: number, y2: number) => (x2 + 2) * height + (y2 + 2);
	const at = (column: number, row: number) =>
		column < 0 || row < 0 || column >= columns || row >= rows ? 0 : inside[row * columns + column];
	const next = new Map<number, number>();
	for (let row = -1; row < rows; row++) {
		for (let column = -1; column < columns; column++) {
			const corners = at(column, row) | (at(column + 1, row) << 1) | (at(column + 1, row + 1) << 2) | (at(column, row + 1) << 3);
			const sides = SEGMENTS[corners];
			for (let side = 0; side < sides.length; side += 2) {
				const from = sides[side];
				const to = sides[side + 1];
				next.set(key(2 * column + SIDE_X2[from], 2 * row + SIDE_Y2[from]), key(2 * column + SIDE_X2[to], 2 * row + SIDE_Y2[to]));
			}
		}
	}
	const rings: number[][] = [];
	for (const [start, first] of next) {
		next.delete(start);
		const ring = [Math.floor(start / height) - 2, (start % height) - 2];
		// Every point of a contour leads on to the next, so the ring comes back to its start.
		let point: number | undefined = first;
		while (point !== undefined && point !== start) {
			ring.push(Math.floor(point / height) - 2, (point % height) - 2);
			const to: number | undefined = next.get(point);
			next.delete(point);
			point = to;
		}
		rings.push(ring);
	}
	return rings;
}

/**
 * GeoJSON polygons of the traced rings (flat [x2, y2, …] in doubled lattice coordinates of `grid`'s cell centres):
 * each hole goes with the smallest outer ring around it, then every ring is simplified to `tolerance` (in doubled
 * lattice units), and one that simplifies away is dropped.
 */
export function polygons(rings: number[][], grid: CellGrid, tolerance: number): number[][][][] {
	const outers: { ring: number[]; area: number; box: Box; holes: number[][] }[] = [];
	const holes: number[][] = [];
	for (const ring of rings) {
		const area = signedArea(ring);
		if (area > 0) {
			outers.push({ ring, area, box: boxOf(ring), holes: [] });
		} else {
			holes.push(ring);
		}
	}
	outers.sort((one, two) => one.area - two.area);
	for (const hole of holes) {
		const [x, y] = hole;
		// The box first: the outer ring of a 12 h ring is the size of the whole ring, with thousands of points.
		outers
			.find(({ box, ring }) => x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY && contains(ring, x, y))
			?.holes.push(hole);
	}
	const toLonLat = (ring: number[]) => {
		const points: number[][] = [];
		for (let index = 0; index < ring.length; index += 2) {
			const lon = (grid.minLon + (ring[index] / 2 + 0.5) * grid.cellLon) / E7;
			const lat = (grid.minLat + (ring[index + 1] / 2 + 0.5) * grid.cellLat) / E7;
			points.push([round(lon), round(lat)]);
		}
		points.push(points[0]);
		return points;
	};
	const result: number[][][][] = [];
	// The largest first.
	for (const outer of outers.toReversed()) {
		const simplified = simplifyRing(outer.ring, tolerance);
		if (simplified.length < 6) {
			continue;
		}
		const polygon = [toLonLat(simplified)];
		for (const hole of outer.holes) {
			const simplifiedHole = simplifyRing(hole, tolerance);
			if (simplifiedHole.length >= 6) {
				polygon.push(toLonLat(simplifiedHole));
			}
		}
		result.push(polygon);
	}
	return result;
}

interface Box {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
}

function boxOf(ring: number[]): Box {
	let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
	for (let index = 0; index < ring.length; index += 2) {
		minX = Math.min(minX, ring[index]);
		maxX = Math.max(maxX, ring[index]);
		minY = Math.min(minY, ring[index + 1]);
		maxY = Math.max(maxY, ring[index + 1]);
	}
	return { minX, maxX, minY, maxY };
}

function round(degrees: number): number {
	return Math.round(degrees * 1e5) / 1e5;
}

/** Twice the signed area of a flat ring: positive when it runs counter-clockwise. */
function signedArea(ring: number[]): number {
	let area = 0;
	for (let index = 0; index < ring.length; index += 2) {
		const next = (index + 2) % ring.length;
		area += ring[index] * ring[next + 1] - ring[next] * ring[index + 1];
	}
	return area;
}

function contains(ring: number[], x: number, y: number): boolean {
	let inside = false;
	for (let index = 0; index < ring.length; index += 2) {
		const next = (index + 2) % ring.length;
		const [x1, y1, x2, y2] = [ring[index], ring[index + 1], ring[next], ring[next + 1]];
		if (y1 > y !== y2 > y && x < x1 + ((x2 - x1) * (y - y1)) / (y2 - y1)) {
			inside = !inside;
		}
	}
	return inside;
}

/** Douglas–Peucker on a closed flat ring: split at the point furthest from the first, simplify both halves. */
function simplifyRing(ring: number[], tolerance: number): number[] {
	const count = ring.length / 2;
	let far = 0;
	let farDistance = -1;
	for (let point = 1; point < count; point++) {
		const distance = Math.hypot(ring[2 * point] - ring[0], ring[2 * point + 1] - ring[1]);
		if (distance > farDistance) {
			far = point;
			farDistance = distance;
		}
	}
	const keep = new Uint8Array(count + 1);
	keep[0] = keep[far] = keep[count] = 1;
	const spans: [number, number][] = [
		[0, far],
		[far, count],
	];
	for (let span = spans.pop(); span !== undefined; span = spans.pop()) {
		const [first, last] = span;
		const worst = worstPoint(ring, span, tolerance);
		if (worst >= 0) {
			keep[worst] = 1;
			spans.push([first, worst], [worst, last]);
		}
	}
	const simplified: number[] = [];
	for (let point = 0; point < count; point++) {
		if (keep[point] === 1) {
			simplified.push(ring[2 * point], ring[2 * point + 1]);
		}
	}
	return simplified;
}

/**
 * The point of the ring between `first` and `last` (a point past the last is the first again) furthest from the
 * line through them, if further than `tolerance`; −1 when there is none.
 */
function worstPoint(ring: number[], [first, last]: readonly [number, number], tolerance: number): number {
	const count = ring.length / 2;
	const x = (point: number) => ring[2 * (point % count)];
	const y = (point: number) => ring[2 * (point % count) + 1];
	let worst = -1;
	let worstDistance = tolerance;
	const dx = x(last) - x(first);
	const dy = y(last) - y(first);
	const length = Math.hypot(dx, dy);
	for (let point = first + 1; point < last; point++) {
		const distance =
			length === 0
				? Math.hypot(x(point) - x(first), y(point) - y(first))
				: Math.abs(dy * (x(point) - x(first)) - dx * (y(point) - y(first))) / length;
		if (distance > worstDistance) {
			worst = point;
			worstDistance = distance;
		}
	}
	return worst;
}
