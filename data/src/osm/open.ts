import { openOsmXml } from './xml.ts';
import type { OsmSource } from './source.ts';

/** The OSM file at `path`, by its extension: `.osm` is XML. */
export function openOsm(path: string): OsmSource {
	if (path.endsWith('.osm')) {
		return openOsmXml(path);
	}
	throw new Error(`Not an OSM file this builder reads: ${path}`);
}
