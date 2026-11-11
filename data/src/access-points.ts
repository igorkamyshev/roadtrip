// The access points of places (GLOSSARY «Подъезд»; amendment «Набор данных» of spec #20): points of the graph's roads
// where a car gets to a place. A place with a point (a peak, a waterfall, a cave) gets the nearest point of a road in
// each country within a reach (MAX_ACCESS_METERS of places.ts); one with an outline, the roads inside it and near its
// edge, one in each cell of a grid and country.
import { METERS_PER_DEGREE } from 'engine/geo';
import type { Graph } from 'engine/graph';
import type { Point } from './cities-file.ts';
import { type AccessPoint, nearOutline, type PlaceOutline } from './places-file.ts';
import { RoadIndex } from './road-index.ts';

/**
 * The access points of places with a point: a function of a place's point (degrees), one of `places`, giving the
 * nearest point of a road in each zone within `reach` metres, the nearest first. Only a road with both ends in one
 * zone counts, as for the origin (engine/src/snap.ts), so a point is in its road's zone.
 */
export function pointAccess(graph: Graph, places: readonly Point[], reach: number): (place: Point) => AccessPoint[] {
	const nearest = zoneNearest(graph, new RoadIndex(graph, reach, places));
	return (place) => nearest(place, () => true);
}

/**
 * Of the roads of `index` near a point (degrees), the point nearest it in each zone that `accept` takes (its
 * latitude and longitude, degrees), the nearest first, to 0.001°. Only a road with both ends in one zone counts, as for
 * the origin (engine/src/snap.ts), so a point is in its road's zone.
 */
function zoneNearest(graph: Graph, index: RoadIndex): (point: Point, accept: (lat: number, lon: number) => boolean) => AccessPoint[] {
	const { nodeLat, nodeLon, nodeZone, zones } = graph;
	return (point, accept) => {
		const nearest = new Map<number, { lat: number; lon: number; meters: number }>();
		index.each(point.lat, point.lon, ({ a, b, fraction, meters }) => {
			const zone = nodeZone[a];
			if (zone === 0 || zone !== nodeZone[b] || meters >= (nearest.get(zone)?.meters ?? Infinity)) {
				return;
			}
			const lat = (nodeLat[a] + fraction * (nodeLat[b] - nodeLat[a])) / 1e7;
			const lon = (nodeLon[a] + fraction * (nodeLon[b] - nodeLon[a])) / 1e7;
			if (accept(lat, lon)) {
				nearest.set(zone, { lat, lon, meters });
			}
		});
		return [...nearest]
			.toSorted(([zoneOne, one], [zoneTwo, two]) => (one.meters === two.meters ? zoneOne - zoneTwo : one.meters - two.meters))
			.map(([zone, { lat, lon }]) => ({ lat: round(lat), lon: round(lon), zone: zones[zone] }));
	};
}

/** The grid of a place's access points: one in each of its cells and zones. The lever of the places file's size. */
const ACCESS_GRID_METERS = 5000;

/** A road this near a place's outline, or inside it, gets an access point. */
const ACCESS_EDGE_METERS = 1000;

/** The grid's rows, degrees: `ACCESS_GRID_METERS` from the equator. Its columns are as wide at the middle of their row. */
const ROW_DEGREES = ACCESS_GRID_METERS / METERS_PER_DEGREE;

/** An outline's rings, as `PlaceOutline`'s. */
type Outlined = Pick<PlaceOutline, 'rings'>;

/** A cell of the grid: its bounds and middle, degrees. */
interface GridCell {
	readonly south: number;
	readonly north: number;
	readonly west: number;
	readonly east: number;
	readonly middle: Point;
}

/**
 * The access points of places with an outline: a function of a place's outline, one of `outlines`, giving in each
 * cell of the grid near it (rows south to north, then columns west to east) and each zone the point of a road
 * nearest the cell's middle, if it is in the cell and inside the outline or within `ACCESS_EDGE_METERS` of its edge;
 * of several zones in a cell, the nearest first. A road whose point nearest the middle is outside the outline is
 * missed there, though it may cross the outline elsewhere in the cell: the cells around catch it. Only a road with
 * both ends in one zone counts, as for `pointAccess`.
 */
export function outlineAccess(graph: Graph, outlines: readonly Outlined[]): (outline: Outlined) => AccessPoint[] {
	// Every road through a cell passes within half its diagonal of its middle; a little more for the columns' slant.
	const index = new RoadIndex(
		graph,
		ACCESS_GRID_METERS * 0.75,
		outlines.flatMap((outline) => gridCells(outline).map(({ middle }) => middle)),
	);
	const nearest = zoneNearest(graph, index);
	return (outline) =>
		gridCells(outline).flatMap((cell) =>
			nearest(cell.middle, (lat, lon) => inCell(cell, lat, lon) && nearOutline(outline, { lat, lon }, ACCESS_EDGE_METERS)),
		);
}

function inCell(cell: GridCell, lat: number, lon: number): boolean {
	return lat >= cell.south && lat < cell.north && lon >= cell.west && lon < cell.east;
}

/** The cells of the grid within `ACCESS_EDGE_METERS` of an outline's box. */
function gridCells(outline: Outlined): GridCell[] {
	const lat = outline.rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 0));
	const lon = outline.rings.flatMap((ring) => ring.filter((_, index) => index % 2 === 1));
	const spare = ACCESS_EDGE_METERS / METERS_PER_DEGREE;
	const cells: GridCell[] = [];
	for (let row = Math.floor((Math.min(...lat) - spare) / ROW_DEGREES); row <= Math.floor((Math.max(...lat) + spare) / ROW_DEGREES); row++) {
		const cos = Math.cos((row + 0.5) * ROW_DEGREES * (Math.PI / 180));
		const width = ROW_DEGREES / cos;
		const [first, last] = [Math.min(...lon) - spare / cos, Math.max(...lon) + spare / cos].map((edge) => Math.floor(edge / width));
		for (let column = first; column <= last; column++) {
			const [south, west] = [row * ROW_DEGREES, column * width];
			cells.push({
				south,
				north: south + ROW_DEGREES,
				west,
				east: west + width,
				middle: { lat: south + ROW_DEGREES / 2, lon: west + width / 2 },
			});
		}
	}
	return cells;
}

/** Degrees to 0.001°, about 100 m: the ring holds the land 1 km around its roads. */
function round(value: number): number {
	return Math.round(value * 1000) / 1000;
}
