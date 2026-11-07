// What the screen draws over the basemap (spec «Экран», «Карта»), bottom to top:
//
// 1. the hatching of closed countries and closed territories, `closed-hatch`: the zone outlines of the dataset
//    (source `zones`, `/data/zones.json`), filtered to the zones `access` closes;
// 2. the ring: `ring-fill`, or `ring-stripes` (running stripes) while a calculation replaces it, and `ring-line`;
// 3. (#32) the labels of the carousel's cities, the chosen one highlighted: insert before `start`;
// 4. the origin's marker, `start`.
//
// The tests read the sources `ring`, `start` and `zones`, the hatching's filter and the layers' visibility, never
// pixels.
import type { FeatureCollection } from 'geojson';
import type { FilterSpecification, GeoJSONSource, Map as MapLibre } from 'maplibre-gl';
import type { RingAnswer } from 'worker/api';
import type { Point } from '../state/point.ts';

export type RingGeometry = Extract<RingAnswer, { outcome: 'ring' }>['ring'];

export const RING_SOURCE = 'ring';
export const START_SOURCE = 'start';
export const ZONES_SOURCE = 'zones';
export const RING_LAYERS = { fill: 'ring-fill', stripes: 'ring-stripes', line: 'ring-line' } as const;
export const START_LAYER = 'start';
export const HATCH_LAYER = 'closed-hatch';

/** The zone outlines, a static asset of the Worker: the dataset's (data's `zoneOutlines`). */
export const ZONE_OUTLINES_URL = '/data/zones.json';

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

const HATCH_IMAGE = 'closed-hatch';
const HATCH_PERIOD = 8;

/** Frames of the running stripes: one pattern shifted along its period. */
const STRIPE_FRAMES = 5;
const STRIPE_PERIOD = 10;
const STRIPE_FRAME_MS = 160;

/**
 * The colours of the ring, the marker and the hatching (`--ring`, `--ring-fill`, `--start`, `--hatch`,
 * `--hatch-veil`), from the page's CSS.
 */
interface OverlayColors {
	readonly ring: string;
	readonly ringFill: string;
	readonly start: string;
	readonly hatch: string;
	readonly hatchVeil: string;
}

function colors(): OverlayColors {
	const style = getComputedStyle(document.documentElement);
	const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
	return {
		ring: read('--ring', '#1b5fd6'),
		ringFill: read('--ring-fill', 'rgba(27, 95, 214, .24)'),
		start: read('--start', '#e2412c'),
		hatch: read('--hatch', 'rgba(84, 95, 90, .55)'),
		hatchVeil: read('--hatch-veil', 'rgba(220, 223, 216, .35)'),
	};
}

/** Adds the overlay's sources, images and layers to a map whose style has loaded. */
export function addOverlay(map: MapLibre): void {
	const { ring, ringFill, start, hatch, hatchVeil } = colors();
	map.addSource(ZONES_SOURCE, { type: 'geojson', data: EMPTY });
	map.addSource(RING_SOURCE, { type: 'geojson', data: EMPTY });
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
	map.addLayer({
		id: START_LAYER,
		type: 'circle',
		source: START_SOURCE,
		paint: { 'circle-radius': 7, 'circle-color': start, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
	});
}

/** Shows `ring`, striped while a calculation is to replace it, or nothing. */
export function showRing(map: MapLibre, ring: RingGeometry | undefined, striped: boolean): void {
	source(map, RING_SOURCE).setData(ring === undefined ? EMPTY : { type: 'Feature', properties: {}, geometry: ring });
	map.setLayoutProperty(RING_LAYERS.fill, 'visibility', striped ? 'none' : 'visible');
	map.setLayoutProperty(RING_LAYERS.stripes, 'visibility', striped ? 'visible' : 'none');
	map.setPaintProperty(RING_LAYERS.line, 'line-dasharray', striped ? [2, 3] : undefined);
}

/** Puts the marker exactly at the origin, wherever the engine snapped it to a road. */
export function showStart(map: MapLibre, origin: Point | undefined): void {
	source(map, START_SOURCE).setData(
		origin === undefined ? EMPTY : { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] } },
	);
}

/** Puts the zone outlines on the map, for the hatching. */
export function showOutlines(map: MapLibre, outlines: FeatureCollection): void {
	source(map, ZONES_SOURCE).setData(outlines);
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
		return response.ok ? ((await response.json()) as FeatureCollection) : EMPTY;
	} catch {
		return EMPTY;
	}
}

/** Runs the stripes until the returned function stops them. Still stripes for those who reduce motion. */
export function runStripes(map: MapLibre): () => void {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

function source(map: MapLibre, id: string): GeoJSONSource {
	const found = map.getSource<GeoJSONSource>(id);
	if (found === undefined) {
		throw new Error(`the overlay's source ${id} is not on the map`);
	}
	return found;
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
