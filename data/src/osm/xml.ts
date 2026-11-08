// OSM XML (https://wiki.openstreetmap.org/wiki/OSM_XML), read whole into memory: for the small hand-written
// files of the tests. A country or the world comes as PBF (pbf.ts).
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import type { OsmMember, OsmNode, OsmRelation, OsmSource, OsmWay, Tags } from './source.ts';

interface XmlTag {
	k: string;
	v: string;
}

interface XmlElement {
	id: string;
	tag?: XmlTag[];
}

interface XmlDocument {
	osm?: {
		node?: (XmlElement & { lat: string; lon: string })[];
		way?: (XmlElement & { nd?: { ref: string }[] })[];
		relation?: (XmlElement & { member?: { type: OsmMember['type']; ref: string; role?: string }[] })[];
	};
}

const LISTS = new Set(['node', 'way', 'relation', 'tag', 'nd', 'member']);

export function openOsmXml(path: string): OsmSource {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '',
		parseAttributeValue: false,
		isArray: (name) => LISTS.has(name),
	});
	const osm = (parser.parse(readFileSync(path, 'utf8')) as XmlDocument).osm ?? {};
	const nodes: OsmNode[] = (osm.node ?? []).map((node) => ({
		id: Number(node.id),
		lat: e7(node.lat),
		lon: e7(node.lon),
		tags: tags(node),
	}));
	const ways: OsmWay[] = (osm.way ?? []).map((way) => ({
		id: Number(way.id),
		refs: (way.nd ?? []).map((nd) => Number(nd.ref)),
		tags: tags(way),
	}));
	const relations: OsmRelation[] = (osm.relation ?? []).map((relation) => ({
		id: Number(relation.id),
		members: (relation.member ?? []).map((member) => ({ type: member.type, ref: Number(member.ref), role: member.role ?? '' })),
		tags: tags(relation),
	}));
	return {
		read(visitor) {
			for (const node of visitor.node ? nodes : []) {
				visitor.node?.(node);
			}
			for (const way of visitor.way ? ways : []) {
				visitor.way?.(way);
			}
			for (const relation of visitor.relation ? relations : []) {
				visitor.relation?.(relation);
			}
		},
	};
}

function e7(degrees: string): number {
	return Math.round(Number(degrees) * 1e7);
}

function tags(element: XmlElement): Tags {
	return Object.fromEntries((element.tag ?? []).map(({ k, v }) => [k, String(v)]));
}
