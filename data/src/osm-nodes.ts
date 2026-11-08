// The coordinates of the road and boundary nodes of an extract whose ways carry none (a country's raw extract),
// kept by id in typed arrays outside the JS heap, and where the builder takes a way's node from.
import { Column } from './column.ts';
import { NodeIds } from './node-ids.ts';
import type { OsmWay } from './osm/source.ts';

/** Writes the coordinates of the way's node `index` to `point`; false when the file lacks the node. */
export type Locate = (way: OsmWay, index: number, point: Int32Array) => boolean;

/** OSM nodes by id, numbered as first met, with their coordinates once known. */
export class OsmNodes {
	ids = new NodeIds();
	lat = new Column((length) => new Int32Array(length));
	lon = new Column((length) => new Int32Array(length));
	located = new Column((length) => new Uint8Array(length));

	add(id: number): void {
		if (this.ids.add(id) === this.lat.length) {
			this.lat.push(0);
			this.lon.push(0);
			this.located.push(0);
		}
	}

	/** Gives node `number` its coordinates, unless it has them already; a number below 0 is no node. */
	locate(number: number, lat: number, lon: number): void {
		if (number >= 0 && this.located.values[number] === 0) {
			this.lat.values[number] = lat;
			this.lon.values[number] = lon;
			this.located.values[number] = 1;
		}
	}

	/** Writes node `number`'s coordinates to `point`; false when it has none. */
	coordinates(number: number, point: Int32Array): boolean {
		if (number < 0 || this.located.values[number] === 0) {
			return false;
		}
		point[0] = this.lat.values[number];
		point[1] = this.lon.values[number];
		return true;
	}

	clear(): void {
		this.ids = new NodeIds();
		this.lat = new Column((length) => new Int32Array(length));
		this.lon = new Column((length) => new Int32Array(length));
		this.located = new Column((length) => new Uint8Array(length));
	}
}

/** `Locate` of the file's ways: a way's own locations when the file carries them, else its nodes' in `unlocated`. */
export function wayNodeLocator(unlocated: OsmNodes): Locate {
	return (way, index, point) => {
		if (way.locations === undefined) {
			return unlocated.coordinates(unlocated.ids.get(way.refs[index]), point);
		}
		const lat = way.locations.lat[index];
		if (Number.isNaN(lat)) {
			return false;
		}
		point[0] = lat;
		point[1] = way.locations.lon[index];
		return true;
	};
}
