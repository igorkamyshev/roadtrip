// PROTOTYPE (#148), throwaway branch only: places on the map, by variant. They share the source `cities` with the
// cities (a city's `type` is ''), at their access point.
// A: a white round badge with the type's icon in the ring's colour; chosen, the origin's colour with a white icon.
// B: a diamond, green for nature, terracotta for history; its name in that colour.
// C: the type's emoji on a white disc; the chosen one with a dashed line from its access point to the place itself.
import type { ExpressionSpecification, Map as MapLibre } from 'maplibre-gl';
import { groupOf, PLACE_TYPES, TYPE_EMOJI, VARIANT, type PlaceType } from './places-prototype.ts';
import { TYPE_ICON_PATHS } from './type-icons.ts';

export const PLACE_LAYER = 'place-icons';
export const PLACE_LINK_SOURCE = 'place-link';
const PLACE_LINK_LAYER = 'place-link';

const RATIO = 2;
const NATURE = '#2f7d4a';
const HISTORY = '#a4552e';

interface Colors {
	readonly ring: string;
	readonly start: string;
	readonly city: string;
	readonly halo: string;
}

function canvas(size: number): { readonly context: CanvasRenderingContext2D; readonly image: () => ImageData } {
	const element = document.createElement('canvas');
	element.width = size * RATIO;
	element.height = size * RATIO;
	const context = element.getContext('2d');
	if (context === null) {
		throw new Error('no 2d canvas');
	}
	context.scale(RATIO, RATIO);
	return { context, image: () => context.getImageData(0, 0, size * RATIO, size * RATIO) };
}

/** A round disc the size of the image, with its outline. */
function disc(
	context: CanvasRenderingContext2D,
	size: number,
	{ fill, stroke, width }: { readonly fill: string; readonly stroke: string; readonly width: number },
): void {
	context.beginPath();
	context.arc(size / 2, size / 2, size / 2 - 1.5, 0, Math.PI * 2);
	context.fillStyle = fill;
	context.fill();
	context.lineWidth = width;
	context.strokeStyle = stroke;
	context.stroke();
}

function badge(type: PlaceType, chosen: boolean, colors: Colors): ImageData {
	const size = chosen ? 32 : 24;
	const { context, image } = canvas(size);
	disc(context, size, { fill: chosen ? colors.start : '#ffffff', stroke: chosen ? '#ffffff' : colors.ring, width: 1.5 });
	const glyph = size * 0.58;
	context.translate((size - glyph) / 2, (size - glyph) / 2);
	context.scale(glyph / 15, glyph / 15);
	context.fillStyle = chosen ? '#ffffff' : colors.ring;
	// oxlint-disable-next-line unicorn/no-array-fill-with-reference-type -- a canvas's fill, not an array's
	context.fill(new Path2D(TYPE_ICON_PATHS[type]), 'evenodd');
	return image();
}

function diamond(type: PlaceType, chosen: boolean, colors: Colors): ImageData {
	const size = chosen ? 22 : 15;
	const { context, image } = canvas(size);
	const half = size / 2;
	context.beginPath();
	context.moveTo(half, 1.5);
	context.lineTo(size - 1.5, half);
	context.lineTo(half, size - 1.5);
	context.lineTo(1.5, half);
	context.closePath();
	context.fillStyle = chosen ? colors.start : groupOf(type) === 'nature' ? NATURE : HISTORY;
	context.fill();
	context.lineWidth = 1.5;
	context.strokeStyle = colors.halo;
	context.stroke();
	return image();
}

function emoji(type: PlaceType, chosen: boolean, colors: Colors): ImageData {
	const size = chosen ? 36 : 26;
	const { context, image } = canvas(size);
	disc(context, size, { fill: '#ffffff', stroke: chosen ? colors.start : 'rgba(0, 0, 0, .25)', width: chosen ? 2.5 : 1 });
	context.font = `${Math.round(size * 0.58)}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(TYPE_EMOJI[type], size / 2, size / 2 + size * 0.04);
	return image();
}

const DRAW = { a: badge, b: diamond, c: emoji } as const;

function imageName(type: string, chosen: boolean): string {
	return `place-${type}${chosen ? '-on' : ''}`;
}

/** The places' images and layers, over the cities' dots and under the origin. */
export function addPlaceLayers(map: MapLibre, colors: Colors): void {
	for (const type of PLACE_TYPES) {
		for (const chosen of [false, true]) {
			map.addImage(imageName(type, chosen), DRAW[VARIANT](type, chosen, colors), { pixelRatio: RATIO });
		}
	}
	map.addSource(PLACE_LINK_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
	map.addLayer({
		id: PLACE_LINK_LAYER,
		type: 'line',
		source: PLACE_LINK_SOURCE,
		paint: { 'line-color': colors.start, 'line-width': 1.5, 'line-dasharray': [2, 2] },
	});
	const chosen: ExpressionSpecification = ['get', 'chosen'];
	const textColor: ExpressionSpecification | string =
		VARIANT === 'b' ? ['case', ['in', ['get', 'type'], ['literal', ['monastery', 'castle', 'ruins']]], HISTORY, NATURE] : colors.city;
	map.addLayer({
		id: PLACE_LAYER,
		type: 'symbol',
		source: 'cities',
		filter: ['!=', ['get', 'type'], ''],
		layout: {
			'icon-image': ['concat', 'place-', ['get', 'type'], ['case', chosen, '-on', '']],
			'icon-allow-overlap': true,
			// The places with a card full size, the others smaller.
			'icon-size': ['case', ['any', ['get', 'label'], chosen], 1, VARIANT === 'b' ? 0.75 : 0.65],
			'text-field': ['case', ['any', ['get', 'label'], chosen], ['get', 'name'], ''],
			'text-font': VARIANT === 'b' ? ['Noto Sans Italic'] : ['Noto Sans Medium'],
			'text-size': ['case', chosen, 14, 12],
			'text-anchor': 'left',
			'text-offset': VARIANT === 'b' ? [0.8, 0] : [1.3, 0],
			'text-optional': true,
			'symbol-sort-key': ['case', chosen, -1, ['get', 'rank']],
		},
		paint: { 'text-color': textColor, 'text-halo-color': colors.halo, 'text-halo-width': 1.5 },
	});
}
