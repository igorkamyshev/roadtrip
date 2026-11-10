// The map under the whole screen: MapLibre GL with the basemap and the overlay (use-map.ts, overlay.ts). It shows
// the ring whole when a new one comes, with room for the phrase, the slider and the carousel, goes to a city when the
// screen says (camera.ts), and tells the screen of a tap on a city.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibre } from 'maplibre-gl';
import { useEffect, useImperativeHandle, useRef, type ReactElement, type Ref } from 'react';
import { DropPin } from '../screen/icons.tsx';
import { PIN_HINT } from '../screen/pin-bar.tsx';
import type { LatLon } from '../state/point.ts';
import { mapHandle, useCamera, type MapHandle } from './camera.ts';
import type { MapCity, RingGeometry } from './overlay.ts';
import { useCityTaps, useMapLibre, useOverlay } from './use-map.ts';

/**
 * The event the map view announces its MapLibre map with, on `window`, once it is loaded and shows what the screen
 * gave it. Nothing in the client listens and nothing keeps the map on `window`: the screen tests listen from an init
 * script and read the map's sources through it (e2e/fixtures.ts, e2e/screen.ts), on the very build that is deployed.
 */
const MAP_EVENT = 'roadtrip:map';

export interface MapViewProps {
	readonly origin: LatLon | undefined;
	readonly ring: RingGeometry | undefined;
	/** The ring stands in for one being calculated: running stripes. */
	readonly striped: boolean;
	/** Changes with every new ring to show whole; undefined while the ring is an old one. */
	readonly fit: string | undefined;
	/** The pin mode: the pin in the middle of the map. */
	readonly pinning: boolean;
	/** The zones to hatch: the countries and closed territories `access` closes. */
	readonly closed: readonly string[];
	/** The ring's cities to show, biggest first. */
	readonly cities: readonly MapCity[];
	/** A tap on a city's dot or name. */
	readonly onCity: (id: number) => void;
	readonly ref?: Ref<MapHandle>;
}

export function MapView({ origin, ring, striped, fit, pinning, closed, cities, onCity, ref }: MapViewProps): ReactElement {
	const container = useRef<HTMLDivElement>(null);
	const map = useMapLibre(container, origin);
	useImperativeHandle(ref, () => mapHandle(map, origin), [map, origin]);
	useCityTaps(map, pinning ? undefined : onCity);
	useOverlay(map, { origin, ring, striped, closed, cities });
	useCamera(map, { origin, ring, fit });
	usePinFocus(map, pinning);

	// Last: the effects above have shown the screen's state on the loaded map by now (MAP_EVENT).
	useEffect(() => {
		if (map !== undefined) {
			window.dispatchEvent(new CustomEvent(MAP_EVENT, { detail: map }));
		}
	}, [map]);

	return (
		<div className="map">
			{/* A tap on the map changes only the canvas, never the page: PostHog would take every tap for a dead click. */}
			<div ref={container} className="map-canvas ph-no-deadclick ph-no-rageclick" data-testid="map" />
			{pinning ? (
				<div className="crosshair">
					<DropPin />
				</div>
			) : null}
		</div>
	);
}

/**
 * In the pin mode (#107) the canvas has the focus, so the arrows move the map at once, and the pin panel's hint
 * describes it. Once the map is loaded, and after a sheet the mode was turned on from has given the focus back.
 */
function usePinFocus(map: MapLibre | undefined, pinning: boolean): void {
	useEffect(() => (map !== undefined && pinning ? pinCanvas(map.getCanvas()) : undefined), [map, pinning]);
}

/** Describes the canvas by the pin's hint and gives it the focus; returns what takes the description away. */
function pinCanvas(canvas: HTMLCanvasElement): () => void {
	canvas.setAttribute('aria-describedby', PIN_HINT);
	canvas.focus({ preventScroll: true });
	return () => {
		canvas.removeAttribute('aria-describedby');
	};
}
