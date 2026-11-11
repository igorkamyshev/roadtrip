// What the screen draws over the basemap (spec #20 «Экран», «Карта»), bottom to top:
//
// 1. the hatching of closed countries and closed territories, `closed-hatch`: the zone outlines of the dataset
//    (source `zones`, `/data/zones.json`), filtered to the zones `access` closes;
// 2. the ring: `ring-fill`, or `ring-stripes` (running stripes) while a calculation replaces it, and `ring-line`;
// 3. the ring's points of interest, the cities only for now (source `cities`): a dot for each of the most famous,
//    `city-dots`, and the names of the carousel's and of the chosen one, `city-labels`; the chosen one larger, in the
//    origin's colour;
// 4. the origin's marker, `start`.
//
// The tests read the sources `ring`, `start`, `zones` and `cities`, the hatching's filter and the layers'
// visibility, never pixels.
import type { FeatureCollection, GeoJSON } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import type { RingAnswer } from 'worker/api';
import type { LatLon } from '../state/point.ts';
import { matchesMedia } from '../media.ts';

export type RingGeometry = Extract<RingAnswer, { outcome: 'ring' }>['ring'];

const RING_SOURCE = 'ring';
const START_SOURCE = 'start';
const ZONES_SOURCE = 'zones';
const RING_LAYERS = { fill: 'ring-fill', stripes: 'ring-stripes', line: 'ring-line' } as const;
const START_LAYER = 'start';
const HATCH_LAYER = 'closed-hatch';
const CITIES_SOURCE = 'cities';
const CITY_LAYERS = { dots: 'city-dots', labels: 'city-labels' } as const;

/** A point of interest as the map shows it. */
export interface MapPoint {
	/** The point of interest's key, which a tap on it tells. */
	readonly key: string;
	readonly name: string;
	readonly lat: number;
	readonly lon: number;
	/** Named on the map: a point of the carousel, or the chosen one. */
	readonly label: boolean;
	readonly chosen: boolean;
}

/** The zone outlines, a static asset of the Worker: the dataset's (data's `zoneOutlines`). */
const ZONE_OUTLINES_URL = '/data/zones.json';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

const HATCH_IMAGE = 'closed-hatch';
const HATCH_PERIOD = 8;

/** Frames of the running stripes: one pattern shifted along its period. */
const STRIPE_FRAMES = 5;
const STRIPE_PERIOD = 10;
const STRIPE_FRAME_MS = 160;

/**
 * The colours of the ring, the marker, the hatching and the cities (`--ring`, `--ring-fill`, `--start`, `--hatch`,
 * `--hatch-veil`, `--city`, `--halo`), from the page's CSS.
 */
interface OverlayColors {
	readonly ring: string;
	readonly ringFill: string;
	readonly start: string;
	readonly hatch: string;
	readonly hatchVeil: string;
	readonly city: string;
	readonly halo: string;
}

function colors(): OverlayColors {
	const style = getComputedStyle(document.documentElement);
	const read = (name: string, fallback: string): string => {
		const value = style.getPropertyValue(name).trim();
		return value === '' ? fallback : value;
	};
	return {
		ring: read('--ring', '#1b5fd6'),
		ringFill: read('--ring-fill', 'rgba(27, 95, 214, .24)'),
		start: read('--start', '#e2412c'),
		hatch: read('--hatch', 'rgba(84, 95, 90, .55)'),
		hatchVeil: read('--hatch-veil', 'rgba(220, 223, 216, .35)'),
		city: read('--city', '#0e2a5a'),
		halo: read('--halo', '#f4f6f2'),
	};
}

/** Adds the overlay's sources, images and layers to a map whose style has loaded. */
export function addOverlay(map: MapLibre): void {
	const { ring, ringFill, start, hatch, hatchVeil, city, halo } = colors();
	map.addSource(ZONES_SOURCE, { type: 'geojson', data: EMPTY });
	map.addSource(RING_SOURCE, { type: 'geojson', data: EMPTY });
	map.addSource(CITIES_SOURCE, { type: 'geojson', data: EMPTY });
	map.addSource(START_SOURCE, { type: 'geojson', data: EMPTY });
	map.addImage(HATCH_IMAGE, hatching(hatch, hatchVeil), { pixelRatio: 2 });
	for (let frame = 0; frame < STRIPE_FRAMES; frame++) {
		map.addImage(stripeImage(frame), stripes(frame, ring));
	}
	map.addLayer({ id: HATCH_LAYER, type: 'fill', source: ZONES_SOURCE, filter: closedFilter([]), paint: { 'fill-pattern': HATCH_IMAGE } });
	map.addLayer({ id: RING_LAYERS.fill, type: 'fill', source: RING_SOURCE, paint: { 'fill-color': ringFill } });
	map.addLayer({
		id: RING_LAYERS.stripes,
		type: 'fill',
		source: RING_SOURCE,
		layout: { visibility: 'none' },
		paint: { 'fill-pattern': stripeImage(0) },
	});
	map.addLayer({ id: RING_LAYERS.line, type: 'line', source: RING_SOURCE, paint: { 'line-color': ring, 'line-width': 1.6 } });
	const chosen: ExpressionSpecification = ['get', 'chosen'];
	map.addLayer({
		id: CITY_LAYERS.dots,
		type: 'circle',
		source: CITIES_SOURCE,
		paint: {
			'circle-radius': ['case', chosen, 6, 3],
			'circle-color': ['case', chosen, start, city],
			'circle-stroke-color': halo,
			'circle-stroke-width': 1.2,
		},
	});
	map.addLayer({
		id: CITY_LAYERS.labels,
		type: 'symbol',
		source: CITIES_SOURCE,
		filter: ['get', 'label'],
		layout: {
			'text-field': ['get', 'name'],
			// A fontstack of the basemap's (public/basemap/fonts).
			'text-font': ['Noto Sans Medium'],
			'text-size': ['case', chosen, 14, 12],
			'text-anchor': 'left',
			'text-offset': [0.6, 0],
			// Where labels collide, the chosen one wins, then the more famous point.
			'symbol-sort-key': ['case', chosen, -1, ['get', 'rank']],
		},
		paint: { 'text-color': city, 'text-halo-color': halo, 'text-halo-width': 1.5 },
	});
	map.addLayer({
		id: START_LAYER,
		type: 'circle',
		source: START_SOURCE,
		paint: { 'circle-radius': 7, 'circle-color': start, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
	});
}

/** Shows `ring`, striped while a calculation is to replace it, or nothing. */
export function showRing(map: MapLibre, ring: RingGeometry | undefined, striped: boolean): void {
	setData(map, RING_SOURCE, ring === undefined ? EMPTY : { type: 'Feature', properties: {}, geometry: ring });
	map.setLayoutProperty(RING_LAYERS.fill, 'visibility', striped ? 'none' : 'visible');
	map.setLayoutProperty(RING_LAYERS.stripes, 'visibility', striped ? 'visible' : 'none');
	map.setPaintProperty(RING_LAYERS.line, 'line-dasharray', striped ? [2, 3] : undefined);
}

/** Puts the marker exactly at the origin, wherever the engine snapped it to a road. */
export function showStart(map: MapLibre, origin: LatLon | undefined): void {
	setData(
		map,
		START_SOURCE,
		origin === undefined ? EMPTY : { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] } },
	);
}

/** Shows the ring's points of interest, the most famous first: their dots, and the names of those with a label. */
export function showPoints(map: MapLibre, points: readonly MapPoint[]): void {
	setData(map, CITIES_SOURCE, {
		type: 'FeatureCollection',
		features: points.map(({ key, name, lat, lon, label, chosen }, rank) => ({
			type: 'Feature',
			properties: { key, name, label, chosen, rank },
			geometry: { type: 'Point', coordinates: [lon, lat] },
		})),
	});
}

/**
 * The key of the point of interest whose dot or label is nearest to a point of the map's canvas, within `radius`
 * pixels.
 */
export function pointAt(map: MapLibre, { x, y }: { readonly x: number; readonly y: number }, radius: number): string | undefined {
	const near = map.queryRenderedFeatures(
		[
			[x - radius, y - radius],
			[x + radius, y + radius],
		],
		{ layers: [CITY_LAYERS.dots, CITY_LAYERS.labels] },
	);
	let found: string | undefined;
	let best = Infinity;
	for (const feature of near) {
		if (feature.geometry.type !== 'Point') {
			continue;
		}
		const [lon, lat] = feature.geometry.coordinates;
		const at = map.project([lon, lat]);
		const distance = Math.hypot(at.x - x, at.y - y);
		if (distance < best) {
			best = distance;
			found = String(feature.properties.key);
		}
	}
	return found;
}

/** Puts the zone outlines on the map, for the hatching. */
export function showOutlines(map: MapLibre, outlines: FeatureCollection): void {
	setData(map, ZONES_SOURCE, outlines);
}

/** Hatches the zones in `closed`: country codes and closed territories, as `access` names them. */
export function showClosed(map: MapLibre, closed: readonly string[]): void {
	map.setFilter(HATCH_LAYER, closedFilter(closed));
}

function closedFilter(closed: readonly string[]): FilterSpecification {
	return ['in', ['get', 'zone'], ['literal', [...closed]]];
}

/** The zone outlines from the Worker; an empty collection when they cannot be had, and nothing is hatched. */
export async function loadOutlines(): Promise<FeatureCollection> {
	try {
		const response = await fetch(ZONE_OUTLINES_URL);
		const outlines: unknown = response.ok ? await response.json() : undefined;
		return isFeatureCollection(outlines) ? outlines : EMPTY;
	} catch {
		return EMPTY;
	}
}

/** A GeoJSON FeatureCollection; its features are then the outlines data's `zoneOutlines` writes. */
function isFeatureCollection(value: unknown): value is FeatureCollection {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		value.type === 'FeatureCollection' &&
		'features' in value &&
		Array.isArray(value.features)
	);
}

/** Runs the stripes until the returned function stops them. Still stripes for those who reduce motion. */
export function runStripes(map: MapLibre): () => void {
	if (matchesMedia('reduced-motion')) {
		return () => {};
	}
	let frame = 0;
	const timer = setInterval(() => {
		frame = (frame + 1) % STRIPE_FRAMES;
		map.setPaintProperty(RING_LAYERS.stripes, 'fill-pattern', stripeImage(frame));
	}, STRIPE_FRAME_MS);
	// Only the timer stops: the map may be gone by then, and the next stripes may start from any frame.
	return () => {
		clearInterval(timer);
	};
}

/**
 * Gives one of the overlay's sources its data. MapLibre applies it in its worker; the promise of that is not waited
 * for, and a later call replaces the data anyway.
 */
function setData(map: MapLibre, id: string, data: GeoJSON): void {
	const found = map.getSource<GeoJSONSource>(id);
	if (found === undefined) {
		throw new Error(`the overlay's source ${id} is not on the map`);
	}
	void found.setData(data);
}

function stripeImage(frame: number): string {
	return `ring-stripes-${frame}`;
}

/** Diagonal stripes of the ring's colour at 35 %, half the period wide, shifted by `frame` steps. */
function stripes(frame: number, color: string): { width: number; height: number; data: Uint8Array } {
	const [red, green, blue] = rgb(color);
	const data = new Uint8Array(STRIPE_PERIOD * STRIPE_PERIOD * 4);
	const shift = (frame * STRIPE_PERIOD) / STRIPE_FRAMES;
	for (let y = 0; y < STRIPE_PERIOD; y++) {
		for (let x = 0; x < STRIPE_PERIOD; x++) {
			if ((x + y + shift) % STRIPE_PERIOD < STRIPE_PERIOD / 2) {
				data.set([red, green, blue, Math.round(255 * 0.35)], (y * STRIPE_PERIOD + x) * 4);
			}
		}
	}
	return { width: STRIPE_PERIOD, height: STRIPE_PERIOD, data };
}

/**
 * The hatching's tile, at a pixel ratio of 2: diagonal lines of `line` a quarter of the period wide over a veil of
 * `veil`, seamless in both directions.
 */
function hatching(line: string, veil: string): { width: number; height: number; data: Uint8Array } {
	const size = HATCH_PERIOD * 2;
	const lineColor = rgba(line);
	const veilColor = rgba(veil);
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			data.set((x + y) % size < size / 4 ? lineColor : veilColor, (y * size + x) * 4);
		}
	}
	return { width: size, height: size, data };
}

/** The red, green and blue of a CSS colour, through a canvas so that any CSS form works. */
function rgb(color: string): [number, number, number] {
	const [red, green, blue] = rgba(color);
	return [red, green, blue];
}

/** The red, green, blue and alpha (0–255) of a CSS colour, through a canvas so that any CSS form works. */
function rgba(color: string): [number, number, number, number] {
	const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
	if (context === null) {
		return [27, 95, 214, 255];
	}
	context.clearRect(0, 0, 1, 1);
	context.fillStyle = color;
	context.fillRect(0, 0, 1, 1);
	const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data;
	return [red, green, blue, alpha];
}
