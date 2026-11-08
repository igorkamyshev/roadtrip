// OSM XML (https://wiki.openstreetmap.org/wiki/OSM_XML), read whole into memory: for the small hand-written
// files of the tests. A country or the world comes as PBF (pbf.ts).
import { readFileSync } from 'node:fs';
import { XMLParser } from 'fast-xml-parser';
import type { OsmMember, OsmNode, OsmRelation, OsmSource, OsmWay, Tags } from './source.ts';

/**
 * An element as the parser gives it: its attributes, strings by `parseAttributeValue: false`, and its children,
 * a list for each name of LISTS.
 */
type XmlElement = Readonly<Record<string, unknown>>;

const LISTS = new Set(['node', 'way', 'relation', 'tag', 'nd', 'member']);

export function openOsmXml(path: string): OsmSource {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '',
		parseAttributeValue: false,
		isArray: (name) => LISTS.has(name),
	});
	const document: unknown = parser.parse(readFileSync(path, 'utf8'));
	const osm = isElement(document) && isElement(document.osm) ? document.osm : {};
	const nodes: OsmNode[] = children(osm, 'node').map((node) => ({
		id: Number(attribute(node, 'id')),
		lat: e7(attribute(node, 'lat')),
		lon: e7(attribute(node, 'lon')),
		tags: tags(node),
	}));
	const ways: OsmWay[] = children(osm, 'way').map((way) => ({
		id: Number(attribute(way, 'id')),
		refs: children(way, 'nd').map((nd) => Number(attribute(nd, 'ref'))),
		tags: tags(way),
	}));
	const relations: OsmRelation[] = children(osm, 'relation').map((relation) => ({
		id: Number(attribute(relation, 'id')),
		members: children(relation, 'member').map((member) => ({
			type: memberType(attribute(member, 'type')),
			ref: Number(attribute(member, 'ref')),
			role: typeof member.role === 'string' ? member.role : '',
		})),
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

function isElement(value: unknown): value is XmlElement {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The element's children named `name`, in order. */
function children(element: XmlElement, name: string): XmlElement[] {
	const list = element[name];
	return Array.isArray(list) ? list.filter((child: unknown) => isElement(child)) : [];
}

/** The attribute `name` of the element; an error when it has none. */
function attribute(element: XmlElement, name: string): string {
	const value = element[name];
	if (typeof value !== 'string') {
		throw new TypeError(`OSM XML: an element without ${name}`);
	}
	return value;
}

function memberType(type: string): OsmMember['type'] {
	if (type !== 'node' && type !== 'way' && type !== 'relation') {
		throw new Error(`OSM XML: a member of type ${type}`);
	}
	return type;
}

function e7(degrees: string): number {
	return Math.round(Number(degrees) * 1e7);
}

function tags(element: XmlElement): Tags {
	return Object.fromEntries(children(element, 'tag').map((tag) => [attribute(tag, 'k'), attribute(tag, 'v')]));
}
