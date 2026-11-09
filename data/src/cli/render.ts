// Draws rings the ring command wrote side by side in a PNG, as the screen draws them: the fill and the 1.6 px line of
// web/src/styles.css (--ring-fill, --ring) by the even-odd rule, the origin a red dot. Under each label, what the
// ring is made of: polygons, holes, points, the GeoJSON's size and the time of its contour. For the pictures before
// and after a change of the engine.
//
//   pnpm --filter data render <out.png> <label=ring.geojson>…
//
// Uses @playwright/test's Chromium, which `pnpm --filter web exec playwright install chromium` installs; a cloud
// session has it already.
import { readFileSync, statSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { field, isRecord, items } from 'engine/json';
import { log, userPath } from './input.ts';

const WIDTH = 900;
const MAX_HEIGHT = 1400;
const RING_LINE = '#1b5fd6';
const RING_FILL = 'rgba(27, 95, 214, 0.24)';
const GROUND = '#f3f1ec';
const ORIGIN = '#e2412c';

/** [lon, lat] points of each ring of each polygon: a GeoJSON MultiPolygon's coordinates. */
type Polygons = readonly (readonly (readonly [number, number])[])[][];

interface Panel {
	readonly label: string;
	readonly polygons: Polygons;
	readonly origin: readonly [number, number];
	readonly summary: string;
}

const out = process.argv.at(2);
const inputs = process.argv.slice(3);
if (out === undefined || !out.endsWith('.png') || inputs.length === 0 || inputs.some((input) => !input.includes('='))) {
	log('usage: pnpm --filter data render <out.png> <label=ring.geojson>…');
	process.exit(2);
}
const panels = inputs.map((input) => panel(input.slice(0, input.indexOf('=')), userPath(input.slice(input.indexOf('=') + 1))));
for (const { label, summary } of panels) {
	process.stdout.write(`${label}: ${summary}\n`);
}
const shotHeight = await screenshot(svgPage(panels), WIDTH * panels.length, userPath(out));
log(`wrote ${out}: ${panels.length} rings, ${WIDTH * panels.length} × ${shotHeight} px`);

function panel(label: string, path: string): Panel {
	const [feature] = items(field(JSON.parse(readFileSync(path, 'utf8')), 'features'), `${path}: the features`);
	const geometry = field(feature, 'geometry');
	const properties = field(feature, 'properties');
	const polygons: Polygons = isRecord(geometry)
		? items(field(geometry, 'coordinates'), 'the coordinates').map((polygon) =>
				items(polygon, 'a polygon').map((ring) => items(ring, 'a ring').map((point) => lonLat(point))),
			)
		: [];
	const origin = field(properties, 'origin');
	const contourMs = field(field(properties, 'timings'), 'contourMs');
	const holes = polygons.reduce((sum, polygon) => sum + polygon.length - 1, 0);
	const points = polygons.flat().reduce((sum, ring) => sum + ring.length, 0);
	const kilobytes = Math.round(statSync(path).size / 1024);
	return {
		label,
		polygons,
		origin: [Number(field(origin, 'lon')), Number(field(origin, 'lat'))],
		summary:
			`${String(field(properties, 'outcome'))}: ${polygons.length} polygons, ${holes} holes, ${points} points, ${kilobytes} KB, ` +
			`contour ${typeof contourMs === 'number' ? Math.round(contourMs) : '?'} ms`,
	};
}

function lonLat(point: unknown): [number, number] {
	const [lon, lat] = items(point, 'a point');
	return [Number(lon), Number(lat)];
}

/** One page of the panels side by side, each an SVG over the box of every ring, so their scales match. */
function svgPage(all: readonly Panel[]): string {
	const lons = all.flatMap(({ polygons, origin }) => [origin[0], ...polygons.flatMap((polygon) => polygon[0].map(([lon]) => lon))]);
	const lats = all.flatMap(({ polygons, origin }) => [origin[1], ...polygons.flatMap((polygon) => polygon[0].map(([, lat]) => lat))]);
	const [west, east, south, north] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
	// Degrees of longitude shrink with the cosine of the latitude.
	const squeeze = Math.cos((((south + north) / 2) * Math.PI) / 180);
	const spanX = Math.max((east - west) * squeeze, 1e-6);
	const spanY = Math.max(north - south, 1e-6);
	const height = Math.round(Math.min(MAX_HEIGHT, Math.max(300, 20 + ((WIDTH - 20) * spanY) / spanX)));
	const scale = Math.min((WIDTH - 20) / spanX, (height - 20) / spanY);
	const x = (lon: number) => (10 + (lon - west) * squeeze * scale).toFixed(1);
	const y = (lat: number) => (height - 10 - (lat - south) * scale).toFixed(1);
	const svg = ({ polygons, origin }: Panel) => {
		const path = polygons
			.flat()
			.map((ring) => `M${ring.map(([lon, lat]) => `${x(lon)},${y(lat)}`).join('L')}Z`)
			.join('');
		return (
			`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" style="display:block;background:${GROUND}">` +
			`<path d="${path}" fill="${RING_FILL}" fill-rule="evenodd" stroke="${RING_LINE}" stroke-width="1.6"/>` +
			`<circle cx="${x(origin[0])}" cy="${y(origin[1])}" r="5" fill="${ORIGIN}"/></svg>`
		);
	};
	return (
		'<body style="margin:0;font:15px sans-serif;background:#fff"><div style="display:flex">' +
		all
			.map(
				(one) =>
					`<div><div style="padding:8px 12px">${escape(one.label)}<br><span style="color:#555;font-size:13px">` +
					`${escape(one.summary)}</span></div>${svg(one)}</div>`,
			)
			.join('') +
		'</div></body>'
	);
}

/** Text for HTML. */
function escape(text: string): string {
	return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

/** The page's screenshot at `path`; its height in pixels. */
async function screenshot(html: string, width: number, path: string): Promise<number> {
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage({ viewport: { width, height: 600 } });
		await page.setContent(html);
		await page.screenshot({ path, fullPage: true });
		return Number(await page.evaluate('document.documentElement.scrollHeight'));
	} finally {
		await browser.close();
	}
}
