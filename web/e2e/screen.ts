// Reading the screen in its tests: the DOM by role and text, the map by its sources and layers (never pixels),
// through the MapLibre map the client exposes as `window.__roadtripMap`.
import type { Page } from '@playwright/test';
import type { Feature, FeatureCollection, GeoJSON, Geometry } from 'geojson';

/** The phrase over the map: «Из точки [на карте], до 1 часа в пути. … ⓘ». */
export const phrase = (page: Page) => page.getByTestId('phrase');

/** The first card of the carousel: the ring's summary or the state. */
export const firstCard = (page: Page) => page.getByTestId('first-card');

export const slider = (page: Page) => page.getByRole('slider', { name: 'Время в пути' });

/** The GeoJSON of a map source: `ring` (the ring) or `start` (the origin's marker). */
export async function sourceData(page: Page, source: 'ring' | 'start'): Promise<FeatureCollection> {
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

/** The map's visible bounds, [west, south, east, north], once the camera has stopped. */
export async function mapBounds(page: Page): Promise<[number, number, number, number]> {
	await mapAtRest(page);
	return page.evaluate(() => {
		const map = (window as unknown as { __roadtripMap: MapForTests }).__roadtripMap;
		const bounds = map.getBounds();
		return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
	});
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
	getSource(id: string): { getData(): Promise<GeoJSON> } | undefined;
	getLayoutProperty(layer: string, name: string): unknown;
	getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number };
	getCenter(): { lat: number; lng: number };
}
