// Where the map looks (spec #20 «Экран», «Карта»): over Europe before there is an origin, at the origin once there is,
// the whole ring when a new one comes, with room for the phrase, the slider and the carousel; and the handle the
// screen moves it with. The room is fixed on the narrow screen; on the wide one it is the free area the screen gives
// when the camera moves (#108).
import type { Map as MapLibre, PaddingOptions } from 'maplibre-gl';
import { useEffect } from 'react';
import { point, type LatLon } from '../state/point.ts';
import type { RingGeometry } from './overlay.ts';

/** Room on the narrow screen around the ring for the phrase (top), the slider (right) and the carousel (bottom), as in the prototype. */
const MAP_PADDING = { top: 130, right: 74, bottom: 200, left: 16 } as const;

/**
 * The part of the screen no panel covers, in the window's CSS pixels, where the screen has one (the wide screen); read
 * when the camera moves, never after: what the panels do later moves nothing.
 */
export type FreeArea = () => DOMRectReadOnly | undefined;

/** The room around what the map shows: the free area's distance from the map's edges, else the fixed room. */
function room(map: MapLibre, freeArea: FreeArea): Required<PaddingOptions> {
	const area = freeArea();
	if (area === undefined) {
		return MAP_PADDING;
	}
	const canvas = map.getContainer().getBoundingClientRect();
	return {
		top: area.top - canvas.top,
		right: canvas.right - area.right,
		bottom: canvas.bottom - area.bottom,
		left: area.left - canvas.left,
	};
}

/** Before there is an origin: Europe and around it. */
const OVERVIEW = { center: [25, 48] as [number, number], zoom: 3 };
/** The zoom an origin is shown at until its ring comes. */
const ORIGIN_ZOOM = 7;

/** What the screen asks of the map. */
export interface MapHandle {
	/** The point under the pin: the map's centre. */
	readonly center: () => LatLon;
	/** Moves the map to a place, keeping the zoom unless it is below `minZoom`, with room for the phrase and the carousel. */
	readonly goTo: (place: LatLon, minZoom?: number) => void;
}

/** Where a new map opens: at the origin, or over Europe without one. */
export function openingView(origin: LatLon | undefined): { readonly center: [number, number]; readonly zoom: number } {
	return origin === undefined ? OVERVIEW : { center: [origin.lon, origin.lat], zoom: ORIGIN_ZOOM };
}

/**
 * The handle of `map`, or of the map to come: its centre is then the origin's, or the overview's. A place goes to the
 * middle of the room `freeArea` leaves.
 */
export function mapHandle(map: MapLibre | undefined, origin: LatLon | undefined, freeArea: FreeArea): MapHandle {
	return {
		center: () => {
			const center = map?.getCenter().wrap();
			return center === undefined ? (origin ?? point(OVERVIEW.center[1], OVERVIEW.center[0])) : point(center.lat, center.lng);
		},
		goTo: (place, minZoom = 0) => {
			if (map === undefined) {
				return;
			}
			// An offset, not a padding: a padding would stay on the map and move its centre off the pin's.
			const { top, right, bottom, left } = room(map, freeArea);
			map.easeTo({
				center: [place.lon, place.lat],
				zoom: Math.max(map.getZoom(), minZoom),
				offset: [(left - right) / 2, (top - bottom) / 2],
			});
		},
	};
}

export interface Camera {
	readonly origin: LatLon | undefined;
	readonly ring: RingGeometry | undefined;
	/** Changes with every new ring to show whole; undefined while the ring is an old one. */
	readonly fit: string | undefined;
	/** The part of the screen no panel covers, on the wide screen; one function for good: another would show the ring again. */
	readonly freeArea: FreeArea;
}

/** Moves the camera to a new origin, and over a new ring in the room `freeArea` leaves. */
export function useCamera(map: MapLibre | undefined, { origin, ring, fit, freeArea }: Camera): void {
	// The origin is the same object while the point stays (useScreenState): only another point moves the map.
	useEffect(() => {
		if (map !== undefined && origin !== undefined) {
			map.easeTo({ center: [origin.lon, origin.lat], zoom: Math.max(map.getZoom(), ORIGIN_ZOOM) });
		}
	}, [map, origin]);

	// Only a new ring moves the camera: `fit` changes with each, and is undefined while an old one stands in.
	useEffect(() => {
		if (map !== undefined && fit !== undefined && ring !== undefined) {
			map.fitBounds(bounds(ring), { padding: room(map, freeArea), maxZoom: 11 });
		}
	}, [map, fit, ring, freeArea]);
}

/** [[west, south], [east, north]] of the ring. */
function bounds(ring: RingGeometry): [[number, number], [number, number]] {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const polygon of ring.coordinates) {
		for (const [lon, lat] of polygon[0] ?? []) {
			west = Math.min(west, lon);
			east = Math.max(east, lon);
			south = Math.min(south, lat);
			north = Math.max(north, lat);
		}
	}
	return [
		[west, south],
		[east, north],
	];
}
