// The map under the whole screen: MapLibre GL with the basemap and the overlay (overlay.ts). It shows the ring
// whole when a new one comes, with room for the phrase, the slider and the carousel, goes to a city when the screen
// says, and tells the screen of a tap on a city.
import { Map as MapLibre, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { point, pointText, type LatLon } from '../state/point.ts';
import { DropPin } from '../screen/icons.tsx';
import { basemapStyle } from './basemap.ts';
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

declare global {
	interface Window {
		/** The map, for the screen tests to read its sources (e2e/screen.ts). */
		__roadtripMap?: MapLibre;
	}
}

/** Room around the ring for the phrase (top), the slider (right) and the carousel (bottom), as in the prototype. */
export const MAP_PADDING = { top: 130, right: 74, bottom: 200, left: 16 } as const;

/** Before there is an origin: Europe and around it. */
const OVERVIEW = { center: [25, 48] as [number, number], zoom: 3 };
/** The zoom an origin is shown at until its ring comes. */
const ORIGIN_ZOOM = 7;

export interface MapHandle {
	/** The point under the pin: the map's centre. */
	center(): LatLon;
	/** Moves the map to a place, keeping the zoom unless it is below `minZoom`, with room for the phrase and the carousel. */
	goTo(place: LatLon, minZoom?: number): void;
}

/** How far from a city's dot a tap still picks it, in pixels: a finger is not a pointer. */
const TAP_RADIUS = 16;

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

export function MapView({ origin, ring, striped, fit, pinning, closed, cities, onCity, ref }: MapViewProps) {
	const container = useRef<HTMLDivElement>(null);
	const [map, setMap] = useState<MapLibre>();
	const initialOrigin = useRef(origin);

	useEffect(() => {
		if (container.current === null) {
			return;
		}
		const start = initialOrigin.current;
		const created = new MapLibre({
			container: container.current,
			style: basemapStyle(),
			...(start === undefined ? OVERVIEW : { center: [start.lon, start.lat], zoom: ORIGIN_ZOOM }),
			attributionControl: { compact: true },
		});
		window.__roadtripMap = created;
		let removed = false;
		created.once('load', () => {
			addOverlay(created);
			setMap(created);
			void loadOutlines().then((outlines) => {
				if (!removed) {
					showOutlines(created, outlines);
				}
			});
		});
		return () => {
			removed = true;
			created.remove();
			setMap(undefined);
		};
	}, []);

	useImperativeHandle(
		ref,
		() => ({
			center() {
				const center = map?.getCenter().wrap();
				return center === undefined ? (origin ?? point(OVERVIEW.center[1], OVERVIEW.center[0])) : point(center.lat, center.lng);
			},
			goTo(place, minZoom = 0) {
				// An offset, not a padding: a padding would stay on the map and move its centre off the pin's.
				const { top, right, bottom, left } = MAP_PADDING;
				map?.easeTo({ center: [place.lon, place.lat], zoom: Math.max(map.getZoom(), minZoom), offset: [(left - right) / 2, (top - bottom) / 2] });
			},
		}),
		[map, origin],
	);

	useEffect(() => {
		if (map !== undefined) {
			showCities(map, cities);
		}
	}, [map, cities]);

	// The latest handler and mode, for the one listener the map keeps.
	const tap = useRef({ onCity, pinning });
	tap.current = { onCity, pinning };
	useEffect(() => {
		if (map === undefined) {
			return;
		}
		const onClick = (event: MapMouseEvent) => {
			const id = tap.current.pinning ? undefined : cityAt(map, event.point.x, event.point.y, TAP_RADIUS);
			if (id !== undefined) {
				tap.current.onCity(id);
			}
		};
		map.on('click', onClick);
		return () => {
			map.off('click', onClick);
		};
	}, [map]);

	const originText = origin === undefined ? undefined : pointText(origin);
	useEffect(() => {
		if (map === undefined) {
			return;
		}
		showStart(map, origin);
		if (origin !== undefined) {
			map.easeTo({ center: [origin.lon, origin.lat], zoom: Math.max(map.getZoom(), ORIGIN_ZOOM) });
		}
		// Keyed by the origin's text: a new object for the same point moves nothing.
	}, [map, originText]);

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

	useEffect(() => {
		if (map === undefined || fit === undefined || ring === undefined) {
			return;
		}
		map.fitBounds(bounds(ring), { padding: MAP_PADDING, maxZoom: 11 });
		// Only a new ring moves the camera, and `fit` changes with each.
	}, [map, fit]);

	return (
		<div className="map">
			{/* A tap on the map changes only the canvas, never the page: PostHog would take every tap for a dead click. */}
			<div ref={container} className="map-canvas ph-no-deadclick ph-no-rageclick" />
			{pinning ? (
				<div className="crosshair">
					<DropPin />
				</div>
			) : null}
		</div>
	);
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
