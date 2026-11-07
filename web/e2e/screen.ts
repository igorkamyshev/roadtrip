// Reading the screen in its tests: the DOM by role and text, the map by its sources and layers (never pixels),
// through the MapLibre map the client exposes as `window.__roadtripMap`.
import type { Page } from '@playwright/test';
import type { Feature, FeatureCollection, GeoJSON, Geometry } from 'geojson';

/** The phrase over the map: «Из точки [на карте], до 1 часа в пути. … ⓘ». */
export const phrase = (page: Page) => page.getByTestId('phrase');

/** The first card of the carousel: the ring's summary or the state. */
export const firstCard = (page: Page) => page.getByTestId('first-card');

export const slider = (page: Page) => page.getByRole('slider', { name: 'Время в пути' });

/**
 * Drags the slider's thumb from its value to `hours`, passing every hour between, and calls `meanwhile` before it
 * lets go. Pointer events, as a finger's.
 */
export async function dragSlider(page: Page, hours: number, meanwhile?: () => Promise<void>): Promise<void> {
	const box = await page.locator('.sl-track').boundingBox();
	if (box === null) {
		throw new Error('the slider is not on the screen');
	}
	const yOf = (value: number) => box.y + box.height * (1 - (value - 1) / 11);
	const x = box.x + box.width / 2;
	const from = Number(await slider(page).getAttribute('aria-valuenow'));
	await page.mouse.move(x, yOf(from));
	await page.mouse.down();
	await page.mouse.move(x, yOf(hours), { steps: 4 * Math.abs(hours - from) + 1 });
	await meanwhile?.();
	await page.mouse.up();
}

/** The hours the slider marks with a dot: their rings are in memory. */
export async function dottedHours(page: Page): Promise<number[]> {
	return (await slider(page).locator('[data-cached]').evaluateAll((ticks) => ticks.map((tick) => Number(tick.getAttribute('data-hours'))))).sort(
		(a, b) => a - b,
	);
}

/** The GeoJSON of a map source: `ring` (the ring), `start` (the origin's marker) or `cities` (the ring's cities). */
export async function sourceData(page: Page, source: 'ring' | 'start' | 'cities'): Promise<FeatureCollection> {
	return page.evaluate(async (id) => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		const data = await map?.getSource(id)?.getData();
		return data?.type === 'FeatureCollection' ? data : { type: 'FeatureCollection', features: data ? [data as Feature] : [] };
	}, source);
}

/** The geometries the ring source holds. */
export async function ringOnMap(page: Page): Promise<Geometry[]> {
	return (await sourceData(page, 'ring')).features.map((feature) => feature.geometry);
}

/** The origin's marker as [lon, lat], or undefined when there is none. */
export async function startOnMap(page: Page): Promise<number[] | undefined> {
	const [feature] = (await sourceData(page, 'start')).features;
	return feature?.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
}

/** Whether the ring is drawn with the running stripes of a calculation (the old ring while a new one comes). */
export async function ringIsStriped(page: Page): Promise<boolean> {
	return page.evaluate(() => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		return map?.getLayoutProperty('ring-stripes', 'visibility') === 'visible';
	});
}

/** The zones the hatching covers: those its layer's filter lets through, sorted. */
export async function hatchedZones(page: Page): Promise<string[]> {
	const filter = await page.evaluate(() => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		// Until the map has loaded, it has no layers.
		return map?.getLayer('closed-hatch') === undefined ? undefined : map.getFilter('closed-hatch');
	});
	// ['in', ['get', 'zone'], ['literal', [codes]]]
	const codes = Array.isArray(filter) && Array.isArray(filter[2]) ? (filter[2] as unknown[])[1] : undefined;
	return Array.isArray(codes) ? (codes as string[]).toSorted() : [];
}

/** The zones whose outlines the map holds (the source `zones`), in its order. */
export async function outlinesOnMap(page: Page): Promise<string[]> {
	const data = await page.evaluate(async () => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		return map?.getSource('zones')?.getData();
	});
	return data?.type === 'FeatureCollection' ? data.features.map((feature) => String(feature.properties?.zone)) : [];
}

/** A city on the map: a dot, and a label when it has a card in the carousel or is the chosen one. */
export interface CityOnMap {
	readonly name: string;
	readonly label: boolean;
	readonly chosen: boolean;
}

/** The cities the map shows, biggest first (the source `cities`). */
export async function citiesOnMap(page: Page): Promise<CityOnMap[]> {
	return (await sourceData(page, 'cities')).features.map(({ properties }) => ({
		name: String(properties?.name),
		label: properties?.label === true,
		chosen: properties?.chosen === true,
	}));
}

/** The names of the cities the map labels, and of the chosen one. */
export async function labelsOnMap(page: Page): Promise<{ labels: string[]; chosen: string[] }> {
	const cities = await citiesOnMap(page);
	return { labels: cities.filter((city) => city.label).map((city) => city.name), chosen: cities.filter((city) => city.chosen).map((city) => city.name) };
}

/** Taps the map where the point (lat, lon) is, once the map has drawn everything and stopped. */
export async function tapMap(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await page.waitForFunction(() => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		return map !== undefined && map.loaded() && !map.isMoving();
	});
	const { x, y } = await page.evaluate(([lat, lon]) => (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap.project([lon, lat]), [at.lat, at.lon]);
	const box = await page.locator('.map-canvas').boundingBox();
	await page.mouse.click((box?.x ?? 0) + x, (box?.y ?? 0) + y);
}

/**
 * How far, in pixels, the place is from the middle of the map that nothing covers: below the phrase, above the
 * carousel, left of the slider. Once the camera has stopped.
 */
export async function distanceFromTheMiddle(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<number> {
	await mapAtRest(page);
	const [phraseBox, carouselBox, sliderBox, canvasBox] = await Promise.all(
		[phrase(page), page.locator('.c-car'), page.locator('.c-vs'), page.locator('.map-canvas')].map((element) => element.boundingBox()),
	);
	if (phraseBox === null || carouselBox === null || sliderBox === null || canvasBox === null) {
		throw new Error('the phrase, the carousel, the slider or the map is not on the screen');
	}
	const { x, y } = await page.evaluate(([lat, lon]) => (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap.project([lon, lat]), [at.lat, at.lon]);
	const middle = { x: (canvasBox.x + sliderBox.x) / 2, y: (phraseBox.y + phraseBox.height + carouselBox.y) / 2 };
	return Math.hypot(canvasBox.x + x - middle.x, canvasBox.y + y - middle.y);
}

/** The map's visible bounds, [west, south, east, north], once the camera has stopped. */
export async function mapBounds(page: Page): Promise<[number, number, number, number]> {
	await mapAtRest(page);
	return page.evaluate(() => {
		const map = (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap;
		const bounds = map.getBounds();
		return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
	});
}

/** The map's zoom, once the camera has stopped. */
export async function mapZoom(page: Page): Promise<number> {
	await mapAtRest(page);
	return page.evaluate(() => (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap.getZoom());
}

/** The map's centre as { lat, lon }, once the camera has stopped. */
export async function mapCenter(page: Page): Promise<{ lat: number; lon: number }> {
	await mapAtRest(page);
	return page.evaluate(() => {
		const center = (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap.getCenter();
		return { lat: center.lat, lon: center.lng };
	});
}

/** Waits until the camera stops: no pan, zoom or easing under way. */
export async function mapAtRest(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const map = (window as unknown as { __roadtripMap?: MapForTests }).__roadtripMap;
		return map !== undefined && !map.isMoving();
	});
}

/** Drags the map by (dx, dy) pixels from the middle of the screen, as a finger would. */
export async function dragMap(page: Page, dx: number, dy: number): Promise<void> {
	const viewport = page.viewportSize() ?? { width: 390, height: 844 };
	const x = viewport.width / 2;
	const y = viewport.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y + dy, { steps: 12 });
	await page.mouse.up();
	await mapAtRest(page);
}

/** What the tests use of MapLibre's `Map`, without importing MapLibre into Node. */
interface MapForTests {
	isMoving(): boolean;
	loaded(): boolean;
	project(lngLat: [number, number]): { x: number; y: number };
	getSource(id: string): { getData(): Promise<GeoJSON> } | undefined;
	getLayoutProperty(layer: string, name: string): unknown;
	getLayer(layer: string): unknown;
	getFilter(layer: string): unknown;
	getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number };
	getCenter(): { lat: number; lng: number };
	getZoom(): number;
}
