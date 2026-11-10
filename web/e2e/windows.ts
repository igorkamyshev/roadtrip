// The windows of the wide screen's checks (spec #20 «Решения по тестам», #113, #96): the table of sizes and pointers,
// and the layout the screen has on each. The wide screen is a window at least 720 × 500 CSS px; the mouse is
// `(hover: hover) and (pointer: fine)`, which Chromium without `hasTouch` answers, so the touch rows set it. A spec
// runs its checks on each with `test.use(onWindow(window))`.

/** A window of the table: its size, its pointer and the layout the screen has there. */
export interface TestWindow {
	readonly width: number;
	readonly height: number;
	/** A mouse, or a touch screen without one (`hasTouch`). */
	readonly pointer: 'mouse' | 'touch';
	readonly layout: 'wide' | 'narrow';
}

/** The amendment's table, row by row. */
export const WINDOWS: readonly TestWindow[] = [
	// The threshold's corner, and a step under it in width and in height.
	{ width: 720, height: 500, pointer: 'mouse', layout: 'wide' },
	{ width: 719, height: 500, pointer: 'mouse', layout: 'narrow' },
	{ width: 720, height: 499, pointer: 'mouse', layout: 'narrow' },
	// A phone on its side, and upright without a mouse.
	{ width: 932, height: 430, pointer: 'touch', layout: 'narrow' },
	{ width: 390, height: 844, pointer: 'touch', layout: 'narrow' },
	// A tablet upright and on its side.
	{ width: 768, height: 1024, pointer: 'touch', layout: 'wide' },
	{ width: 1024, height: 768, pointer: 'touch', layout: 'wide' },
	// A laptop's 1366×768 under the browser's bars, the lowest desktop window; desktops.
	{ width: 1366, height: 650, pointer: 'mouse', layout: 'wide' },
	{ width: 1440, height: 900, pointer: 'mouse', layout: 'wide' },
	{ width: 1920, height: 1080, pointer: 'mouse', layout: 'wide' },
];

/** The windows of the wide layout. */
export const WIDE_WINDOWS = WINDOWS.filter((window) => window.layout === 'wide');

/** The window as a test's title: «1440×900, mouse». */
export const windowName = (window: TestWindow): string => `${window.width}×${window.height}, ${window.pointer}`;

/** The options of a test that runs on the window: `test.use(onWindow(window))`. */
export function onWindow(window: TestWindow): { viewport: { width: number; height: number }; hasTouch: boolean } {
	return { viewport: { width: window.width, height: window.height }, hasTouch: window.pointer === 'touch' };
}
