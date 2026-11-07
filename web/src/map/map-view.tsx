// The map under the whole screen: MapLibre GL with the basemap and the overlay (overlay.ts). It shows the ring
// whole when a new one comes, with room for the phrase, the slider and the carousel.
import { Map as MapLibre } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { point, pointText, type Point } from '../state/point.ts';
import { DropPin } from '../screen/icons.tsx';
import { basemapStyle } from './basemap.ts';
import { addOverlay, loadOutlines, runStripes, showClosed, showOutlines, showRing, showStart, type RingGeometry } from './overlay.ts';

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
	center(): Point;
}

export interface MapViewProps {
	readonly origin: Point | undefined;
	readonly ring: RingGeometry | undefined;
	/** The ring stands in for one being calculated: running stripes. */
	readonly striped: boolean;
	/** Changes with every new ring to show whole; undefined while the ring is an old one. */
	readonly fit: string | undefined;
	/** The pin mode: the pin in the middle of the map. */
	readonly pinning: boolean;
	/** The zones to hatch: the countries and closed territories `access` closes. */
	readonly closed: readonly string[];
	readonly ref?: Ref<MapHandle>;
}

export function MapView({ origin, ring, striped, fit, pinning, closed, ref }: MapViewProps) {
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
		}),
		[map, origin],
	);

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
			<div ref={container} className="map-canvas" />
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
