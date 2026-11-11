// The MapLibre map of the map view (map-view.tsx): made once with the basemap and the overlay (overlay.ts), kept in
// step with what the screen shows, and listened to for a tap on a point of interest.
import { Map as MapLibre, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { LatLon } from '../state/point.ts';
import { basemapStyle } from './basemap.ts';
import { openingView } from './camera.ts';
import {
	addOverlay,
	loadOutlines,
	pointAt,
	runStripes,
	showClosed,
	showOutlines,
	showPoints,
	showRing,
	showStart,
	type MapPoint,
	type RingGeometry,
} from './overlay.ts';

// MapLibre 6 looks for its worker next to its own module, which the bundle moves: point it at the worker's file.
setWorkerUrl(mapWorkerUrl);

/** How far from a point of interest's dot a tap still picks it, in pixels: a finger is not a pointer. */
const TAP_RADIUS = 16;

/** The map in `container`, made once where the origin it opens with is; undefined until it is loaded. */
export function useMapLibre(container: RefObject<HTMLDivElement | null>, origin: LatLon | undefined): MapLibre | undefined {
	const [map, setMap] = useState<MapLibre>();
	// The origin it opens with; the camera follows the later ones (camera.ts).
	const opening = useRef(origin);
	useEffect(() => {
		const element = container.current;
		return element === null ? undefined : createMap(element, opening.current, setMap);
	}, [container]);
	return map;
}

/**
 * A MapLibre map in `element` that gives itself to `onLoad` once loaded, with the overlay, and calls it with nothing
 * once removed; the zone outlines follow, for the hatching. Returns what removes it.
 */
function createMap(element: HTMLElement, origin: LatLon | undefined, onLoad: (map?: MapLibre) => void): () => void {
	const map = new MapLibre({
		container: element,
		style: basemapStyle(),
		...openingView(origin),
		attributionControl: false,
		// The canvas's name to a screen reader (#107), in the screen's language.
		locale: { 'Map.Title': 'Карта' },
	});
	let removed = false;
	map.once('load', () => {
		addOverlay(map);
		onLoad(map);
		void addOutlines(map, () => removed);
	});
	return () => {
		removed = true;
		map.remove();
		onLoad();
	};
}

/** Puts the zone outlines on the map once they come, unless it is removed by then. */
async function addOutlines(map: MapLibre, removed: () => boolean): Promise<void> {
	const outlines = await loadOutlines();
	if (!removed()) {
		showOutlines(map, outlines);
	}
}

/**
 * Tells `onPoint` of a tap on a point of interest's dot or name, by its key, and shows a pointer over one; without it,
 * as in the pin mode, a tap picks nothing and the cursor is the map's grab everywhere.
 */
export function usePointTaps(map: MapLibre | undefined, onPoint: ((key: string) => void) | undefined): void {
	const tap = useEffectEvent((event: MapMouseEvent) => {
		const key = map === undefined || onPoint === undefined ? undefined : pointAt(map, event.point, TAP_RADIUS);
		if (key !== undefined) {
			onPoint?.(key);
		}
	});
	// The one listener the map keeps: it calls the latest handler.
	useEffect(() => {
		const onClick = (event: MapMouseEvent): void => {
			tap(event);
		};
		map?.on('click', onClick);
		return () => {
			map?.off('click', onClick);
		};
	}, [map]);
	usePointerOverPoints(map, onPoint !== undefined);
}

/**
 * MapLibre's own class of the canvas's container for a pointer (its popups' `trackPointer`): its stylesheet gives the
 * container `cursor: pointer` with it, and still `grabbing` while the map is dragged.
 */
const POINTER = 'maplibregl-track-pointer';

/**
 * The cursor over a point of interest's dot or name, where a tap would pick it (the same hit test and radius), is a
 * pointer (#105); elsewhere, and everywhere while a tap picks nothing (`picking` off, as in the pin mode), the map's
 * own grab.
 */
function usePointerOverPoints(map: MapLibre | undefined, picking: boolean): void {
	useEffect(() => {
		if (map === undefined || !picking) {
			return;
		}
		const container = map.getCanvasContainer();
		const onMove = (event: MapMouseEvent): void => {
			container.classList.toggle(POINTER, pointAt(map, event.point, TAP_RADIUS) !== undefined);
		};
		const onOut = (): void => {
			container.classList.remove(POINTER);
		};
		map.on('mousemove', onMove);
		map.on('mouseout', onOut);
		return () => {
			map.off('mousemove', onMove);
			map.off('mouseout', onOut);
			onOut();
		};
	}, [map, picking]);
}

/** What the overlay shows (overlay.ts). */
export interface Overlay {
	readonly origin: LatLon | undefined;
	readonly ring: RingGeometry | undefined;
	/** The ring stands in for one being calculated: running stripes. */
	readonly striped: boolean;
	/** The zones to hatch. */
	readonly closed: readonly string[];
	readonly points: readonly MapPoint[];
}

/** Keeps the overlay in step with what the screen shows. */
export function useOverlay(map: MapLibre | undefined, { origin, ring, striped, closed, points }: Overlay): void {
	useEffect(() => {
		if (map !== undefined) {
			showPoints(map, points);
		}
	}, [map, points]);
	useEffect(() => {
		if (map !== undefined) {
			showStart(map, origin);
		}
	}, [map, origin]);
	useEffect(() => {
		if (map !== undefined) {
			showRing(map, ring, striped);
		}
	}, [map, ring, striped]);
	useEffect(() => (map !== undefined && striped ? runStripes(map) : undefined), [map, striped]);
	const closedText = closed.join(',');
	useEffect(() => {
		if (map !== undefined) {
			showClosed(map, closedText === '' ? [] : closedText.split(','));
		}
		// Keyed by the codes' text: a new array of the same codes changes nothing.
	}, [map, closedText]);
}
