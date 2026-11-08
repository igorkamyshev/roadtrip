// The MapLibre map of the map view (map-view.tsx): made once with the basemap and the overlay (overlay.ts), kept in
// step with what the screen shows, and listened to for a tap on a city.
import { Map as MapLibre, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { LatLon } from '../state/point.ts';
import { basemapStyle } from './basemap.ts';
import { openingView } from './camera.ts';
import {
	addOverlay,
	cityAt,
	loadOutlines,
	runStripes,
	showCities,
	showClosed,
	showOutlines,
	showRing,
	showStart,
	type MapCity,
	type RingGeometry,
} from './overlay.ts';

// MapLibre 6 looks for its worker next to its own module, which the bundle moves: point it at the worker's file.
setWorkerUrl(mapWorkerUrl);

/** How far from a city's dot a tap still picks it, in pixels: a finger is not a pointer. */
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
	const map = new MapLibre({ container: element, style: basemapStyle(), ...openingView(origin), attributionControl: { compact: true } });
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

/** Tells `onCity` of a tap on a city's dot or name; without it, as in the pin mode, a tap picks nothing. */
export function useCityTaps(map: MapLibre | undefined, onCity: ((id: number) => void) | undefined): void {
	const tap = useEffectEvent((event: MapMouseEvent) => {
		const id = map === undefined || onCity === undefined ? undefined : cityAt(map, event.point, TAP_RADIUS);
		if (id !== undefined) {
			onCity?.(id);
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
}

/** What the overlay shows (overlay.ts). */
export interface Overlay {
	readonly origin: LatLon | undefined;
	readonly ring: RingGeometry | undefined;
	/** The ring stands in for one being calculated: running stripes. */
	readonly striped: boolean;
	/** The zones to hatch. */
	readonly closed: readonly string[];
	readonly cities: readonly MapCity[];
}

/** Keeps the overlay in step with what the screen shows. */
export function useOverlay(map: MapLibre | undefined, { origin, ring, striped, closed, cities }: Overlay): void {
	useEffect(() => {
		if (map !== undefined) {
			showCities(map, cities);
		}
	}, [map, cities]);
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
