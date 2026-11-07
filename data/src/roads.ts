// Which OSM ways are roads of the graph and how fast a car drives them (spec «Набор данных», «Граф»).
import type { Tags } from './osm/source.ts';

/**
 * Speed by road class, km/h: the spec's starting speeds, to be tuned against Valhalla (#24). A change here
 * changes the engine's results: bump ENGINE_VERSION (engine/AGENTS.md).
 */
export const CLASS_SPEED_KMH: Readonly<Record<string, number>> = {
	motorway: 110,
	trunk: 90,
	primary: 70,
	secondary: 60,
	tertiary: 50,
	motorway_link: 60,
	trunk_link: 50,
	primary_link: 40,
	secondary_link: 30,
	tertiary_link: 30,
};

export interface Road {
	readonly kmh: number;
}

/** The road a way is, or undefined when it is no road of the graph. */
export function roadOf(tags: Tags): Road | undefined {
	const kmh = CLASS_SPEED_KMH[tags.highway ?? ''];
	if (kmh === undefined) {
		return undefined;
	}
	return { kmh };
}
