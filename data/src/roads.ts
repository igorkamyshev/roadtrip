// Which OSM ways are roads of the graph and how a car drives them (spec «Набор данных», «Граф»).
import type { Tags } from './osm/source.ts';

/**
 * Speed by road class, km/h: the spec's starting speeds, with motorway (110) and trunk (90) raised against
 * Valhalla in #24 (`data/valhalla-report.md`), where a road's `maxspeed` above them is common. A change here
 * changes the engine's results: bump ENGINE_VERSION (engine/AGENTS.md) and rerun the comparison.
 */
export const CLASS_SPEED_KMH: Readonly<Record<string, number>> = {
	motorway: 130,
	trunk: 100,
	primary: 70,
	secondary: 60,
	tertiary: 50,
	motorway_link: 60,
	trunk_link: 50,
	primary_link: 40,
	secondary_link: 30,
	tertiary_link: 30,
};

/** The access tags for a car, from the most specific; the first one present decides. */
const ACCESS_KEYS = ['motorcar', 'motor_vehicle', 'vehicle', 'access'];
const NO_ACCESS = new Set(['no', 'private']);

export interface Road {
	readonly kmh: number;
	/** Whether a car may drive the way in the order of its nodes. */
	readonly forward: boolean;
	/** Whether a car may drive the way against the order of its nodes. */
	readonly backward: boolean;
}

/** The road a way is, or undefined when it is no road of the graph. */
export function roadOf(tags: Tags): Road | undefined {
	const classKmh = CLASS_SPEED_KMH[tags.highway ?? ''];
	if (classKmh === undefined || tags.route === 'ferry' || tags.area === 'yes') {
		return undefined;
	}
	const access = ACCESS_KEYS.map((key) => tags[key]).find((value) => value !== undefined);
	if (access !== undefined && NO_ACCESS.has(access)) {
		return undefined;
	}
	const kmh = Math.min(classKmh, maxspeedKmh(tags.maxspeed) ?? Infinity);
	const oneway = tags.oneway ?? (tags.highway === 'motorway' || tags.junction === 'roundabout' ? 'yes' : 'no');
	if (oneway === 'yes' || oneway === 'true' || oneway === '1') {
		return { kmh, forward: true, backward: false };
	}
	if (oneway === '-1' || oneway === 'reverse') {
		return { kmh, forward: false, backward: true };
	}
	return { kmh, forward: true, backward: true };
}

/** A `maxspeed` in km/h: a number, in km/h unless it says mph; undefined for anything else ("signals", "RU:urban"). */
function maxspeedKmh(maxspeed: string | undefined): number | undefined {
	const match = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?\s*$/u.exec(maxspeed ?? '');
	if (match === null) {
		return undefined;
	}
	const speed = Number(match[1]) * (match[2] === 'mph' ? 1.609344 : 1);
	return speed > 0 ? speed : undefined;
}
