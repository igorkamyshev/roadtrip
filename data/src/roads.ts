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

/** CLASS_SPEED_KMH looked up by any way's `highway`: undefined for a value that is no road class of the graph. */
const SPEED_BY_HIGHWAY: Readonly<Partial<Record<string, number>>> = CLASS_SPEED_KMH;

/** The access tags for a car, from the most specific; the first one present decides. */
const ACCESS_KEYS = ['motorcar', 'motor_vehicle', 'vehicle', 'access'];
const NO_ACCESS = new Set(['no', 'private']);

/** The `oneway` values of a way driven in the order of its nodes only, and against it only. */
const ONEWAY_FORWARD = new Set(['yes', 'true', '1']);
const ONEWAY_BACKWARD = new Set(['-1', 'reverse']);

export interface Road {
	readonly kmh: number;
	/** Whether a car may drive the way in the order of its nodes. */
	readonly forward: boolean;
	/** Whether a car may drive the way against the order of its nodes. */
	readonly backward: boolean;
}

/** The road a way is, or undefined when it is no road of the graph. */
export function roadOf(tags: Tags): Road | undefined {
	const classKmh = SPEED_BY_HIGHWAY[tags.highway ?? ''];
	if (classKmh === undefined || tags.route === 'ferry' || tags.area === 'yes' || !carMayEnter(tags)) {
		return undefined;
	}
	const kmh = Math.min(classKmh, maxspeedKmh(tags.maxspeed) ?? Infinity);
	const { forward, backward } = directions(tags);
	return { kmh, forward, backward };
}

/** Whether the way's access tags let a car on it. */
function carMayEnter(tags: Tags): boolean {
	const access = ACCESS_KEYS.map((key) => tags[key]).find((value) => value !== undefined);
	return access === undefined || !NO_ACCESS.has(access);
}

/** The directions a car may drive the way in: by its `oneway`, which a motorway and a roundabout imply. */
function directions(tags: Tags): Pick<Road, 'forward' | 'backward'> {
	const oneway = tags.oneway ?? (tags.highway === 'motorway' || tags.junction === 'roundabout' ? 'yes' : 'no');
	return { forward: !ONEWAY_BACKWARD.has(oneway), backward: !ONEWAY_FORWARD.has(oneway) };
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
