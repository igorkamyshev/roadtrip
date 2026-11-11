// The places of the ring on the map (spec #154 «Карта»), the overlay's fourth part (overlay.ts): the source `places`, a
// diamond of the place's group's colour at its access point, outlined in the halo's, `place-diamonds`, full size for a
// place with a card and smaller for the others; the names of the carousel's and of the chosen one in italics of the
// group's colour, `place-labels`; the chosen one's diamond larger, in the origin's colour, and its name larger.
import type { FeatureCollection } from 'geojson';
import type { ExpressionSpecification, Map as MapLibre } from 'maplibre-gl';
import { squareImage, type SquareImage } from './image.ts';

export const PLACES_SOURCE = 'places';
export const PLACE_LAYERS = { diamonds: 'place-diamonds', labels: 'place-labels' } as const;

/** The diamond's image: a signed distance field, so that its colour, outline and size are the layer's. */
const DIAMOND_IMAGE = 'place-diamond';
/** The diamond of a place with a card, corner to corner, in CSS pixels. */
const DIAMOND_SIZE = 14;
/** Room around the diamond in its image for the outline. */
const DIAMOND_BUFFER = 4;

/** The theme's colours the places take (`--start`, `--halo`, `--nature`, `--history`). */
interface PlaceColors {
	readonly start: string;
	readonly halo: string;
	readonly nature: string;
	readonly history: string;
}

/** Adds the places' source, `empty` for now, its diamond and its layers, over the cities' dots and names. */
export function addPlaceLayers(map: MapLibre, { start, halo, nature, history }: PlaceColors, empty: FeatureCollection): void {
	map.addSource(PLACES_SOURCE, { type: 'geojson', data: empty });
	map.addImage(DIAMOND_IMAGE, diamond(), { sdf: true });
	const chosen: ExpressionSpecification = ['get', 'chosen'];
	const groupColor: ExpressionSpecification = ['match', ['get', 'group'], 'history', history, nature];
	// Where symbols collide, the chosen one wins, then the more famous point.
	const sortKey: ExpressionSpecification = ['case', chosen, -1, ['get', 'rank']];
	map.addLayer({
		id: PLACE_LAYERS.diamonds,
		type: 'symbol',
		source: PLACES_SOURCE,
		layout: {
			'icon-image': DIAMOND_IMAGE,
			// Every place's diamond shows, as every city's dot: the names give way, not the points.
			'icon-allow-overlap': true,
			'icon-ignore-placement': true,
			'icon-size': ['case', chosen, 1.4, ['get', 'label'], 1, 0.7],
			'symbol-sort-key': sortKey,
		},
		paint: { 'icon-color': ['case', chosen, start, groupColor], 'icon-halo-color': halo, 'icon-halo-width': 1.2 },
	});
	map.addLayer({
		id: PLACE_LAYERS.labels,
		type: 'symbol',
		source: PLACES_SOURCE,
		filter: ['get', 'label'],
		layout: {
			'text-field': ['get', 'name'],
			// A fontstack of the basemap's (public/basemap/fonts).
			'text-font': ['Noto Sans Italic'],
			'text-size': ['case', chosen, 14, 12],
			'text-anchor': 'left',
			'text-offset': ['case', chosen, ['literal', [0.9, 0]], ['literal', [0.7, 0]]],
			'symbol-sort-key': sortKey,
		},
		paint: { 'text-color': groupColor, 'text-halo-color': halo, 'text-halo-width': 1.5 },
	});
}

/**
 * A diamond as MapLibre's signed distance field (`sdf`), as its glyphs are: the alpha 192 on its edge, 32 more for
 * each pixel inside and less for each outside. At a pixel ratio of 1, so that the outline's width is in CSS pixels.
 */
function diamond(): SquareImage {
	const size = DIAMOND_SIZE + DIAMOND_BUFFER * 2;
	const half = size / 2;
	return squareImage(size, (x, y) => {
		// The distance from the edge |dx| + |dy| = DIAMOND_SIZE / 2, inside positive.
		const inside = (DIAMOND_SIZE / 2 - Math.abs(x + 0.5 - half) - Math.abs(y + 0.5 - half)) / Math.SQRT2;
		return [0, 0, 0, Math.max(0, Math.min(255, Math.round(192 + inside * 32)))];
	});
}
