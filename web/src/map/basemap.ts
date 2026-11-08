// The basemap under the ring (spec «Экран», «Карта»): the style of `@protomaps/basemaps` over the vector tiles the
// Worker serves from the world's PMTiles archive (`/tiles/{z}/{x}/{y}`, worker/src/tiles.ts), with Protomaps'
// fonts and sprites from our own static assets (`public/basemap`, README «Basemap») and the labels in Russian,
// else in the local language. The overlay (overlay.ts) goes on top. The screen tests answer the tiles themselves
// (e2e/fixtures.ts).
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';

const SOURCE = 'protomaps';

/** A label: the Russian name, else the local one (spec). */
const RUSSIAN_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:ru'], ['get', 'name']];

const ATTRIBUTION =
	'<a href="https://github.com/protomaps/basemaps">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/** The basemap in the page's colour scheme: Protomaps' `light`, or `dark` as the screen's dark scheme. */
export function basemapStyle(): StyleSpecification {
	const flavor = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	// Absolute URLs, as MapLibre wants them; concatenated, because URL() would encode the braces.
	const origin = location.origin;
	return {
		version: 8,
		glyphs: `${origin}/basemap/fonts/{fontstack}/{range}.pbf`,
		sprite: `${origin}/basemap/sprites/${flavor}`,
		sources: {
			// To z15, as the world's archive; MapLibre overzooms beyond.
			[SOURCE]: { type: 'vector', tiles: [`${origin}/tiles/{z}/{x}/{y}`], maxzoom: 15, attribution: ATTRIBUTION },
		},
		layers: (layers(SOURCE, namedFlavor(flavor), { lang: 'ru' }) as LayerSpecification[]).map(withRussianName),
	};
}

/**
 * A label layer with its name as `RUSSIAN_NAME`. Protomaps' own `lang: 'ru'` writes the Russian name, else the
 * English one, with the local name on a second line, and names countries in English when there is no Russian.
 * The regions keep their abbreviation below z6 (a `step` on the zoom whose last output is the name); house numbers
 * and road shields have no name and keep their text.
 */
function withRussianName(layer: LayerSpecification): LayerSpecification {
	if (layer.type !== 'symbol') {
		return layer;
	}
	const field = layer.layout?.['text-field'];
	if (field === undefined || !JSON.stringify(field).includes('"name:ru"')) {
		return layer;
	}
	const text =
		Array.isArray(field) && field[0] === 'step' ? ([...field.slice(0, -1), RUSSIAN_NAME] as ExpressionSpecification) : RUSSIAN_NAME;
	return { ...layer, layout: { ...layer.layout, 'text-field': text } };
}
