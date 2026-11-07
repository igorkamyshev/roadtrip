// The origin as the screen keeps it: degrees to 5 decimals (about a metre), the form it has in the link
// (`p=44.81760,20.45730`) and in the ring request.

export interface Point {
	readonly lat: number;
	readonly lon: number;
}

const DECIMALS = 5;
const POINT_TEXT = /^(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/u;

/** The point (lat, lon) to 5 decimals, the longitude wrapped into [−180, 180). */
export function point(lat: number, lon: number): Point {
	const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
	return { lat: round(lat), lon: round(wrapped) };
}

/** `lat,lon` with 5 decimals each, as in the link. */
export function pointText(origin: Point): string {
	return `${origin.lat.toFixed(DECIMALS)},${origin.lon.toFixed(DECIMALS)}`;
}

/** The point a text `lat,lon` names, or undefined for anything else (out of range included). */
export function pointFromText(text: string): Point | undefined {
	const match = POINT_TEXT.exec(text);
	if (match === null) {
		return undefined;
	}
	const lat = Number(match[1]);
	const lon = Number(match[2]);
	return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat: round(lat), lon: round(lon) } : undefined;
}

export function samePoint(a: Point, b: Point): boolean {
	return a.lat === b.lat && a.lon === b.lon;
}

function round(degrees: number): number {
	// + 0 turns −0 into 0.
	return Number(degrees.toFixed(DECIMALS)) + 0;
}
