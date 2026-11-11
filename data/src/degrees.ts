// Degrees as the dataset's files keep them: the cities', the places' and their access points, the outlines' rings.

/** Degrees to 0.001°, about 100 m: the ring holds the land 1 km around its roads, so no file needs more. */
export function roundDegrees(degrees: number): number {
	return Math.round(degrees * 1000) / 1000;
}
