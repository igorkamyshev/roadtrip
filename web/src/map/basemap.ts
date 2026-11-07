// The basemap under the ring. TEMPORARY: OpenStreetMap's raster tiles, until #29 brings the Protomaps basemap
// from our own domain (`/tiles/{z}/{x}/{y}`, the style of `@protomaps/basemaps` with Russian labels, fonts and
// sprites in our static assets). #29 replaces this file; the overlay (overlay.ts) goes on top of any basemap.
// The screen tests answer these tiles themselves (e2e/fixtures.ts) and reach no tile server.
import type { StyleSpecification } from 'maplibre-gl';

export function basemapStyle(): StyleSpecification {
	return {
		version: 8,
		sources: {
			basemap: {
				type: 'raster',
				tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
				tileSize: 256,
				maxzoom: 19,
				attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			},
		},
		layers: [{ id: 'basemap', type: 'raster', source: 'basemap' }],
	};
}
