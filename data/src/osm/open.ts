import { openOsmPbf } from './pbf.ts';
import type { OsmSource } from './source.ts';
import { openOsmXml } from './xml.ts';

/** The OSM file at `path`, by its extension: `.osm` is XML, `.pbf` (`.osm.pbf`) is PBF. */
export function openOsm(path: string): OsmSource {
	if (path.endsWith('.osm')) {
		return openOsmXml(path);
	}
	if (path.endsWith('.pbf')) {
		return openOsmPbf(path);
	}
	throw new Error(`Not an OSM file this builder reads: ${path}`);
}
