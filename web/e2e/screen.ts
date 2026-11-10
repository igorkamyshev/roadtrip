// Reading the screen in its tests: the DOM by role and text, the map by its sources and layers (never pixels),
// through the MapLibre map the client announces once it shows the screen's state, which the fixtures keep as
// `window.mapForTests` (e2e/fixtures.ts). Each reading of the map waits for it. And the screen opened anew, `reopen`,
// once it has asked for its ring.
import { type BrowserContext, expect, type Locator, type Page } from '@playwright/test';
import type { Feature, GeoJSON, Geometry } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';
import type { RingApi } from './ring-api.ts';

/**
 * Keeps the map the client announces (`MAP_EVENT` of src/map/map-view.tsx) as `window.mapForTests`, for the readings
 * below: on every page of a test's context (e2e/fixtures.ts), and on the pages `shots` waits on (tools/pages.ts).
 */
export async function keepMapForTests(target: Page | BrowserContext): Promise<void> {
	await target.addInitScript(() => {
		window.addEventListener('roadtrip:map', (event) => {
			window.mapForTests = event.detail;
		});
	});
}

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

/** The line under the phrase that dates old visa rules, «визовые правила от <дата>». */
export const rulesDate = (page: Page): Locator => phrase(page).getByTestId('rules-date');

/** The map's canvas, as a screen reader names it (MapLibre's locale, `Map.Title`). */
export const theMap = (page: Page): Locator => page.getByRole('region', { name: 'Карта' });

/** Turns the pin mode on, from Belgrade, the origin's word in the phrase: «Откуда едем» and «Указать на карте». */
export async function startPinning(page: Page): Promise<void> {
	await phrase(page).getByRole('button', { name: 'Белград' }).click();
	await page.getByRole('dialog', { name: 'Откуда едем' }).getByRole('button', { name: 'Указать на карте' }).click();
}

/**
 * The first card of the carousel: the ring's summary or the state, which its `data-state` names (`FirstCardState` of
 * src/screen/first-card.tsx): a test that waits for the screen to get somewhere waits on that, not on the copy.
 */
export const firstCard = (page: Page): Locator => page.getByTestId('first-card');

/**
 * The data's sources under the phrase (src/screen/attribution.tsx): shown for 5 s once the screen opens, then hidden in
 * their place.
 */
export const sources = (page: Page): Locator => page.getByTestId('sources');

export const slider = (page: Page): Locator => page.getByRole('slider', { name: 'Время в пути' });

/** The carousel at the bottom of the screen: the first card, the city cards, «и ещё». */
export const carousel = (page: Page): Locator => page.getByTestId('carousel');

/**
 * The carousel's arrows, the plate ‹ › that scrolls it with a mouse (#99): in the slider's row at the right edge on the
 * wide screen, over the cards at the left edge on the narrow one; none without a mouse.
 */
export const carouselArrows = (page: Page): Locator => page.getByTestId('carousel-arrows');

/** «и ещё K / Все города →», the carousel's last card when the ring has more cities than cards. */
export const moreCard = (page: Page): Locator => carousel(page).getByRole('button', { name: /и ещё/u });

/** The cards of the carousel's cities, in order. */
export const cityCards = (page: Page): Locator => page.getByTestId('city-card');

/** The card of the city whose name is in its heading. */
export const cityCard = (page: Page, name: string): Locator =>
	cityCards(page).filter({ has: page.getByRole('heading', { name, exact: true }) });

/**
 * The name of the first city card the window's right edge cuts, 12 px in, where the wide screen's row fades out: the
 * row shows it only in part.
 */
export async function cutCard(page: Page): Promise<string> {
	const { width } = page.viewportSize() ?? { width: 0 };
	for (const card of await cityCards(page).all()) {
		const box = await boxOf(card);
		if (box.x + box.width > width - 12) {
			return card.getByRole('heading').innerText();
		}
	}
	throw new Error('every city card is whole in the row');
}

/** The card of the chosen city: the carousel marks it current. */
export const chosenCard = (page: Page): Locator => cityCards(page).and(page.locator('[aria-current="true"]'));

/**
 * The carousel's cards wholly in the window, by name for `expectApart`: the first card, the city cards and «и ещё»
 * that the row shows whole where it stands now.
 */
export async function cardsInView(page: Page): Promise<Record<string, Locator>> {
	const { width } = page.viewportSize() ?? { width: 0 };
	const cities = page.getByTestId('city-card');
	const cards: [string, Locator][] = [
		['first card', firstCard(page)],
		...Array.from({ length: await cities.count() }, (_, i): [string, Locator] => [`city card ${i + 1}`, cities.nth(i)]),
		['«и ещё»', moreCard(page)],
	];
	const boxes = await Promise.all(cards.map(async ([, card]) => ((await card.count()) === 0 ? null : card.boundingBox())));
	return Object.fromEntries(
		cards.filter((_, i) => {
			const box = boxes[i];
			return box !== null && box.x >= 0 && box.x + box.width <= width;
		}),
	);
}

/**
 * The open sheet of this title, the panel itself: a sheet from the bottom on the narrow screen, a modal in the middle
 * on the wide one. Its dialog fills the screen with the scrim.
 */
export const sheetPanel = (page: Page, title: string | RegExp): Locator => page.getByRole('dialog', { name: title }).getByTestId('sheet');

/** Where the open sheet of this title stands, to the pixel: its left edge, width, middle across, top, height and bottom. */
export async function sheetPlace(
	page: Page,
	title: string | RegExp,
): Promise<{ left: number; width: number; middle: number; top: number; height: number; bottom: number }> {
	const box = await boxOf(sheetPanel(page, title));
	return {
		left: Math.round(box.x),
		width: Math.round(box.width),
		middle: Math.round(box.x + box.width / 2),
		top: Math.round(box.y),
		height: Math.round(box.height),
		bottom: Math.round(box.y + box.height),
	};
}

/** Where an element is on the screen, its box in CSS pixels; it must be there. */
export async function boxOf(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
	const box = await element.boundingBox();
	if (box === null) {
		throw new Error(`${String(element)} is not on the screen`);
	}
	return box;
}

/** A box on the screen in CSS pixels, as `boxOf` reads it. */
export type Box = Awaited<ReturnType<typeof boxOf>>;

/** Whether two boxes share any area: touching edges do not. */
export function overlap(a: Box, b: Box): boolean {
	return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Each box inside the screen, and no two of them on one another. */
export async function expectApart(page: Page, panels: Record<string, Locator>): Promise<void> {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	const boxes = await Promise.all(Object.entries(panels).map(async ([name, element]) => ({ name, at: await boxOf(element) })));
	const off = boxes
		.filter(({ at }) => at.x < 0 || at.y < 0 || at.x + at.width > width || at.y + at.height > height)
		.map(({ name }) => name);
	expect(off, 'panels off the screen').toEqual([]);
	const onOneAnother = boxes.flatMap((a, i) => boxes.slice(i + 1).flatMap((b) => (overlap(a.at, b.at) ? [`${a.name} and ${b.name}`] : [])));
	expect(onOneAnother, 'panels on one another').toEqual([]);
}

/** How far the box stands from each edge of the screen. */
export function fromEdges(page: Page, box: Box): { top: number; right: number; bottom: number; left: number } {
	const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
	return { top: box.y, right: width - box.x - box.width, bottom: height - box.y - box.height, left: box.x };
}

/**
 * Waits for the answer of a ring of `hours` («2–3 ч»): the slider at those hours and the first card a ring's, with
 * its cities, before the cities file comes or without any (`ring`, `no_cities`). Its copy is not read: the tests of
 * the card's texts read them.
 */
export async function expectRingCard(page: Page, hours: string): Promise<void> {
	await expect(slider(page)).toHaveAttribute('aria-valuetext', hours);
	await expect(firstCard(page)).toHaveAttribute('data-state', /^(?:ring|no_cities)$/u);
}

/**
 * The slider's cell of `hours`, its ring's upper bound: N, or 12·D for day D; it reads N or D, or the span («6–7»,
 * «2–3 дня») when it is the one chosen.
 */
export const sliderHour = (page: Page, hours: number): Locator => slider(page).locator(`[data-hours="${hours}"]`);

/** The slider's cells in the unit it shows: the twelve hours, or the days (#83). */
export const sliderCells = (page: Page): Locator => slider(page).locator('[data-hours]');

/**
 * The slider's panel of cells, and its tab of the other unit: «дни ↑» over the hours and «часы ↓» under the days in the
 * column of the narrow screen, «дни →» right of them and «← часы» left of them in the row of the wide one.
 */
export const sliderPanel = (page: Page): Locator => slider(page).getByTestId('slider-panel');
export const sliderTab = (page: Page): Locator => slider(page).locator('[data-tab]');

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
	const box = await page.getByTestId('map').boundingBox();
	await page.mouse.click((box?.x ?? 0) + x, (box?.y ?? 0) + y);
}

/**
 * How far, in pixels, the place is from the middle of the map that nothing covers: below the phrase, above the
 * carousel, left of the slider. Once the camera has stopped.
 */
export async function distanceFromTheMiddle(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<number> {
	await mapAtRest(page);
	const [phraseBox, carouselBox, sliderBox, canvasBox] = await Promise.all(
		[phrase(page), carousel(page), page.getByTestId('slider-column'), page.getByTestId('map')].map(async (element) => boxOf(element)),
	);
	const { x, y } = offTheMap(await page.evaluate(([lat, lon]) => window.mapForTests?.project([lon, lat]), [at.lat, at.lon]));
	const middle = { x: (canvasBox.x + sliderBox.x) / 2, y: (phraseBox.y + phraseBox.height + carouselBox.y) / 2 };
	return Math.hypot(canvasBox.x + x - middle.x, canvasBox.y + y - middle.y);
}

/** Where the map shows the point (lat, lon) on the screen, in CSS pixels from the window's top left corner. */
export async function whereOnScreen(page: Page, at: { readonly lat: number; readonly lon: number }): Promise<{ x: number; y: number }> {
	await mapIsUp(page);
	const { x, y } = offTheMap(await page.evaluate(([lat, lon]) => window.mapForTests?.project([lon, lat]), [at.lat, at.lon]));
	const canvas = await boxOf(page.getByTestId('map'));
	return { x: canvas.x + x, y: canvas.y + y };
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

/** Where a test's held clock stands while the screen opens. */
const START = Date.parse('2026-11-09T12:00:00Z');

/**
 * Holds the page's clock 1 s after the load: none of its timers and frames runs but as the test runs the clock, so a
 * busy machine changes nothing. The data's sources stay under the phrase for its first 5 s.
 */
export async function holdTheClock(page: Page): Promise<void> {
	await page.clock.install({ time: START });
	await page.clock.pauseAt(START + 1000);
}

/**
 * Runs the page's held clock a frame at a time until `done`: what the page does on its timers and frames, MapLibre's
 * loading and TanStack Query's telling of an answer among them, waits for the clock.
 */
export async function runUntil(page: Page, done: () => Promise<boolean>, message: string): Promise<void> {
	await expect
		.poll(
			async () => {
				await page.clock.runFor(16);
				return done();
			},
			{ message, intervals: [50], timeout: 20_000 },
		)
		.toBe(true);
}

/** Longer than any timer of the screen a test waits past: the carousel's stop (140 ms), the map's easing and flight. */
const TIMERS_PAST_MS = 2500;

/** Runs the page's held clock past every timer of the screen, and waits until the map stops. */
export async function settle(page: Page): Promise<void> {
	await page.clock.runFor(TIMERS_PAST_MS);
	await mapAtRest(page);
}

/**
 * Runs the page's held clock until the map is up, then past its flight to the ring: well under the data's sources' 5 s,
 * which a test runs past itself.
 */
export async function runUntilMapAtRest(page: Page): Promise<void> {
	await runUntil(page, async () => page.evaluate(() => window.mapForTests !== undefined), 'the map announced');
	await settle(page);
}

/**
 * Opens the ring of the carousel's tests (`carouselRing` of e2e/fixtures.ts), 2–3 h around Belgrade, on the held
 * clock: its 12 city cards, the map up and come to rest on it.
 */
export async function openTheCarousel(page: Page): Promise<void> {
	await page.goto('/#/?p=44.81760,20.45730&h=3');
	await runUntil(page, async () => (await cityCards(page).count()) === 12, 'the 12 city cards');
	await runUntilMapAtRest(page);
}

/** How far the carousel is scrolled from its start, in CSS pixels. */
export const scrolled = async (page: Page): Promise<number> => carousel(page).evaluate((element) => element.scrollLeft);

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
