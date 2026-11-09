// Reading the screen in its tests: the DOM by role and text, the map by its sources and layers (never pixels),
// through the MapLibre map the client announces once it shows the screen's state, which the fixtures keep as
// `window.mapForTests` (e2e/fixtures.ts). Each reading of the map waits for it. And the screen opened anew, `reopen`,
// once it has asked for its ring.
import { expect, type Locator, type Page } from '@playwright/test';
import type { Feature, GeoJSON, Geometry } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import type { RingApi } from './ring-api.ts';

/** What the tests use of MapLibre's `Map`, without importing MapLibre into Node. */
interface MapForTests {
	readonly isMoving: () => boolean;
	readonly loaded: () => boolean;
	readonly project: (lngLat: [number, number]) => { x: number; y: number };
	readonly getSource: (id: string) => { readonly getData: () => Promise<GeoJSON> } | undefined;
	readonly getLayoutProperty: (layer: string, name: string) => unknown;
	readonly getLayer: (layer: string) => unknown;
	readonly getFilter: (layer: string) => unknown;
	readonly getBounds: () => {
		readonly getWest: () => number;
		readonly getSouth: () => number;
		readonly getEast: () => number;
		readonly getNorth: () => number;
	};
	readonly getCenter: () => { lat: number; lng: number };
	readonly getZoom: () => number;
	readonly getStyle: () => StyleSpecification;
}

declare global {
	interface Window {
		/** The map the client announced, which the fixtures' init script keeps; undefined until then. */
		mapForTests?: MapForTests;
		/** The hours the slider showed since `recordSliderHours`, in order. */
		sliderHoursShown?: number[];
	}

	interface WindowEventMap {
		/** How the client announces its map (`MAP_EVENT` of src/map/map-view.tsx). */
		'roadtrip:map': CustomEvent<MapForTests>;
	}
}

/** What a reading of the map gave, which it always has once the map is up: the page keeps the map it announced. */
function offTheMap<T>(value: T | undefined): T {
	if (value === undefined) {
		throw new Error('the map the client announced is gone');
	}
	return value;
}

/**
 * A new load of the page, as after closing the tab: the browser's storage stays, the memory of rings does not. It
 * leaves the page once the screen has asked for the ring its link names: the link follows the state at once and the
 * request comes after it, so a load in between would drop the request.
 */
export async function reopen(page: Page, ringApi: RingApi, path: string): Promise<void> {
	// The link is read at each poll: the page may not have written its whole state into it yet.
	await expect.poll(() => ringApi.askedFor(page.url()), { message: 'a call to /api/ring for the ring the link names' }).toBe(true);
	await page.goto('about:blank');
	ringApi.newLoad();
	await page.goto(path);
}

/** The phrase over the map: «Из точки [Белград], до 1 часа в пути. … ⓘ». */
export const phrase = (page: Page): Locator => page.getByTestId('phrase');

/**
 * The first card of the carousel: the ring's summary or the state, which its `data-state` names (`FirstCardState` of
 * src/screen/first-card.tsx): a test that waits for the screen to get somewhere waits on that, not on the copy.
 */
export const firstCard = (page: Page): Locator => page.getByTestId('first-card');

export const slider = (page: Page): Locator => page.getByRole('slider', { name: 'Время в пути' });

/**
 * Waits for the answer of a ring of `hours` («2–3 ч»): the slider at those hours and the first card a ring's, with
 * its cities, before the cities file comes or without any (`ring`, `no_cities`). Its copy is not read: the tests of
 * the card's texts read them.
 */
export async function expectRingCard(page: Page, hours: string): Promise<void> {
	await expect(slider(page)).toHaveAttribute('aria-valuetext', hours);
	await expect(firstCard(page)).toHaveAttribute('data-state', /^(?:ring|no_cities)$/u);
}

/** The slider's cell of `hours`: N, or the span («6–7») when it is the one chosen. */
export const sliderHour = (page: Page, hours: number): Locator => slider(page).locator(`[data-hours="${hours}"]`);

/** The middle of the slider's cell of `hours`. */
async function middleOfHour(page: Page, hours: number): Promise<{ x: number; y: number }> {
	const box = await sliderHour(page, hours).boundingBox();
	if (box === null) {
		throw new Error('the slider is not on the screen');
	}
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Drags the slider from the middle of its chosen cell to the middle of the cell of `hours`, passing every hour between,
 * and calls `meanwhile` before it lets go. Pointer events, as a finger's.
 */
export async function dragSlider(page: Page, hours: number, meanwhile?: () => Promise<void>): Promise<void> {
	const from = Number(await slider(page).getAttribute('aria-valuenow'));
	const start = await middleOfHour(page, from);
	const end = await middleOfHour(page, hours);
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 4 * Math.abs(hours - from) + 1 });
	await meanwhile?.();
	await page.mouse.up();
}

/**
 * Records every hours the slider shows from now on (its `aria-valuenow` as it changes), and gives a reading of them in
 * order.
 */
export async function recordSliderHours(page: Page): Promise<() => Promise<number[]>> {
	await slider(page).evaluate((element) => {
		window.sliderHoursShown = [];
		new MutationObserver(() => {
			window.sliderHoursShown?.push(Number(element.getAttribute('aria-valuenow')));
		}).observe(element, { attributes: true, attributeFilter: ['aria-valuenow'] });
	});
	return async () => page.evaluate(() => window.sliderHoursShown ?? []);
}

/** The hours the slider marks (`data-cached`, a light green cell): their rings are in memory. */
export async function dottedHours(page: Page): Promise<number[]> {
	const hours = await slider(page)
		.locator('[data-cached]')
		.evaluateAll((ticks) => ticks.map((tick) => Number(tick.dataset.hours)));
	return hours.toSorted((a, b) => a - b);
}

/**
 * Waits for the map: the client announces it once it is loaded and shows the screen's state (the map view is a chunk
 * of its own, which may come after the first card).
 */
async function mapIsUp(page: Page): Promise<void> {
	await page.waitForFunction(() => window.mapForTests !== undefined);
}

/** The features of a map source: `ring` (the ring), `start` (the origin's marker) or `cities` (the ring's cities). */
async function sourceFeatures(page: Page, source: 'ring' | 'start' | 'cities'): Promise<Feature[]> {
	await mapIsUp(page);
	const data = await page.evaluate(async (id) => window.mapForTests?.getSource(id)?.getData(), source);
	// The screen's sources hold a collection or a single feature (src/map/overlay.ts).
	if (data === undefined) {
		return [];
	}
	if (data.type === 'FeatureCollection') {
		return data.features;
	}
	if (data.type === 'Feature') {
		return [data];
	}
	throw new Error(`the map source ${source} holds a bare ${data.type}`);
}

/** The geometries the ring source holds. */
export async function ringOnMap(page: Page): Promise<Geometry[]> {
	return (await sourceFeatures(page, 'ring')).map((feature) => feature.geometry);
}

/** The origin's marker as [lon, lat], or undefined when there is none. */
export async function startOnMap(page: Page): Promise<number[] | undefined> {
	const feature = (await sourceFeatures(page, 'start')).at(0);
	return feature?.geometry.type === 'Point' ? feature.geometry.coordinates : undefined;
}

/** Whether the ring is drawn with the running stripes of a calculation (the old ring while a new one comes). */
export async function ringIsStriped(page: Page): Promise<boolean> {
	await mapIsUp(page);
	return page.evaluate(() => window.mapForTests?.getLayoutProperty('ring-stripes', 'visibility') === 'visible');
}

/** The codes of the hatching's filter, `['in', ['get', 'zone'], ['literal', [codes]]]`, sorted; none without one. */
function filterCodes(filter: unknown): string[] {
	const literal: unknown = Array.isArray(filter) ? filter[2] : undefined;
	const codes: unknown = Array.isArray(literal) ? literal[1] : undefined;
	return Array.isArray(codes) ? codes.filter((code): code is string => typeof code === 'string').toSorted() : [];
}

/** The zones the hatching covers: those its layer's filter lets through, sorted. */
export async function hatchedZones(page: Page): Promise<string[]> {
	await mapIsUp(page);
	const filter = await page.evaluate(() => {
		const map = window.mapForTests;
		// Until the map has loaded, it has no layers.
		return map?.getLayer('closed-hatch') === undefined ? undefined : map.getFilter('closed-hatch');
	});
	return filterCodes(filter);
}

/** The zones whose outlines the map holds (the source `zones`), in its order. */
export async function outlinesOnMap(page: Page): Promise<string[]> {
	await mapIsUp(page);
	const data = await page.evaluate(async () => window.mapForTests?.getSource('zones')?.getData());
	return data?.type === 'FeatureCollection' ? data.features.map((feature) => String(feature.properties?.zone)) : [];
}

/** A city on the map: a dot, and a label when it has a card in the carousel or is the chosen one. */
interface CityOnMap {
	readonly name: string;
	readonly label: boolean;
	readonly chosen: boolean;
}

/** The cities the map shows, biggest first (the source `cities`). */
export async function citiesOnMap(page: Page): Promise<CityOnMap[]> {
	return (await sourceFeatures(page, 'cities')).map(({ properties }) => ({
		name: String(properties?.name),
		label: properties?.label === true,
		chosen: properties?.chosen === true,
	}));
}

/** The names of the cities the map labels, and of the chosen one. */
export async function labelsOnMap(page: Page): Promise<{ labels: string[]; chosen: string[] }> {
	const cities = await citiesOnMap(page);
	return {
		labels: cities.filter((city) => city.label).map((city) => city.name),
		chosen: cities.filter((city) => city.chosen).map((city) => city.name),
	};
}

/** Taps the map where the point (lat, lon) is, once the map has drawn everything and stopped. */
export async function tapMap(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<void> {
	await page.waitForFunction(() => {
		const map = window.mapForTests;
		return map !== undefined && map.loaded() && !map.isMoving();
	});
	const { x, y } = offTheMap(await page.evaluate(([lat, lon]) => window.mapForTests?.project([lon, lat]), [at.lat, at.lon]));
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
	const { x, y } = offTheMap(await page.evaluate(([lat, lon]) => window.mapForTests?.project([lon, lat]), [at.lat, at.lon]));
	const middle = { x: (canvasBox.x + sliderBox.x) / 2, y: (phraseBox.y + phraseBox.height + carouselBox.y) / 2 };
	return Math.hypot(canvasBox.x + x - middle.x, canvasBox.y + y - middle.y);
}

/** The map's visible bounds, [west, south, east, north], once the camera has stopped. */
export async function mapBounds(page: Page): Promise<[number, number, number, number]> {
	await mapAtRest(page);
	return offTheMap(
		await page.evaluate((): [number, number, number, number] | undefined => {
			const bounds = window.mapForTests?.getBounds();
			return bounds && [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
		}),
	);
}

/** The map's zoom, once the camera has stopped. */
export async function mapZoom(page: Page): Promise<number> {
	await mapAtRest(page);
	return offTheMap(await page.evaluate(() => window.mapForTests?.getZoom()));
}

/** The map's centre as { lat, lon }, once the camera has stopped. */
export async function mapCenter(page: Page): Promise<{ lat: number; lon: number }> {
	await mapAtRest(page);
	return offTheMap(
		await page.evaluate(() => {
			const center = window.mapForTests?.getCenter();
			return center && { lat: center.lat, lon: center.lng };
		}),
	);
}

/** Waits until the camera stops: no pan, zoom or easing under way. */
export async function mapAtRest(page: Page): Promise<void> {
	await page.waitForFunction(() => {
		const map = window.mapForTests;
		return map !== undefined && !map.isMoving();
	});
}

/** The map's style once it has loaded: its sprite, its fonts and the tiles of the view are in. */
export async function loadedStyle(page: Page): Promise<StyleSpecification> {
	await expect.poll(() => page.evaluate(() => window.mapForTests?.loaded() ?? false)).toBe(true);
	return offTheMap(await page.evaluate(() => window.mapForTests?.getStyle()));
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

/**
 * The person leaves the page: the browser's `pagehide`, as when the tab closes or goes to another site. The page
 * itself stays: Playwright does not see the beacons of a page that is really gone.
 */
export async function leave(page: Page): Promise<void> {
	await page.evaluate(() => {
		window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
	});
}
