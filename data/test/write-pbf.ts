// Writes OSM elements as a PBF file (https://wiki.openstreetmap.org/wiki/PBF_Format), for the tests of the PBF
// reader: one header block and one data block with dense nodes, ways and relations, zlib-compressed.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PbfWriter } from 'pbf';
import type { OsmNode, OsmRelation, OsmSource, OsmWay, Tags } from '../src/osm/source.ts';

const MEMBER_TYPES = { node: 0, way: 1, relation: 2 } as const;

export interface PbfOptions {
	/**
	 * Write the coordinates on the ways and leave out the untagged nodes, as `osmium add-locations-to-ways` does.
	 */
	readonly locationsOnWays: boolean;
}

export function writePbf(source: OsmSource, path: string, options: PbfOptions): void {
	const nodes: OsmNode[] = [];
	const ways: OsmWay[] = [];
	const relations: OsmRelation[] = [];
	source.read({ node: (node) => nodes.push(node), way: (way) => ways.push(way), relation: (relation) => relations.push(relation) });
	const coordinates = new Map(nodes.map((node) => [node.id, node]));

	const header = new PbfWriter();
	for (const feature of ['OsmSchema-V0.6', 'DenseNodes']) {
		header.writeStringField(4, feature);
	}
	if (options.locationsOnWays) {
		header.writeStringField(5, 'LocationsOnWays');
	}

	const strings = [''];
	const stringId = (value: string) => {
		const index = strings.indexOf(value);
		return index >= 0 ? index : strings.push(value) - 1;
	};
	const writeTags = (tags: Tags, pbf: PbfWriter) => {
		pbf.writePackedVarint(2, Object.keys(tags).map(stringId));
		pbf.writePackedVarint(3, Object.values(tags).map(stringId));
	};
	const deltas = (values: readonly number[]) => values.map((value, index) => value - (index === 0 ? 0 : values[index - 1]));

	const groups = new PbfWriter();
	const keptNodes = options.locationsOnWays ? nodes.filter((node) => Object.keys(node.tags).length > 0) : nodes;
	groups.writeMessage(2, (_, group) => {
		group.writeMessage(2, (__, dense) => {
			dense.writePackedSVarint(1, deltas(keptNodes.map((node) => node.id)));
			dense.writePackedSVarint(8, deltas(keptNodes.map((node) => node.lat)));
			dense.writePackedSVarint(9, deltas(keptNodes.map((node) => node.lon)));
			dense.writePackedVarint(
				10,
				keptNodes.flatMap((node) => [...Object.entries(node.tags).flatMap(([key, value]) => [stringId(key), stringId(value)]), 0]),
			);
		}, null);
	}, null);
	groups.writeMessage(2, (_, group) => {
		for (const way of ways) {
			group.writeMessage(3, (__, pbf) => {
				pbf.writeVarintField(1, way.id);
				writeTags(way.tags, pbf);
				pbf.writePackedSVarint(8, deltas(way.refs));
				if (options.locationsOnWays) {
					pbf.writePackedSVarint(9, deltas(way.refs.map((ref) => coordinates.get(ref)!.lat)));
					pbf.writePackedSVarint(10, deltas(way.refs.map((ref) => coordinates.get(ref)!.lon)));
				}
			}, null);
		}
	}, null);
	groups.writeMessage(2, (_, group) => {
		for (const relation of relations) {
			group.writeMessage(4, (__, pbf) => {
				pbf.writeVarintField(1, relation.id);
				writeTags(relation.tags, pbf);
				pbf.writePackedVarint(8, relation.members.map((member) => stringId(member.role)));
				pbf.writePackedSVarint(9, deltas(relation.members.map((member) => member.ref)));
				pbf.writePackedVarint(10, relation.members.map((member) => MEMBER_TYPES[member.type]));
			}, null);
		}
	}, null);
	const groupBytes = groups.finish();

	const block = new PbfWriter();
	block.writeMessage(1, (_, table) => strings.forEach((value) => table.writeStringField(1, value)), null);
	// A PrimitiveBlock is its string table (field 1) and its groups (field 2), written above.
	const blockBytes = Buffer.concat([block.finish(), groupBytes]);

	writeFileSync(path, Buffer.concat([blob('OSMHeader', header.finish()), blob('OSMData', blockBytes)]));
}

function blob(type: string, data: Uint8Array): Buffer {
	const body = new PbfWriter();
	body.writeVarintField(2, data.length);
	body.writeBytesField(3, deflateSync(data));
	const bodyBytes = body.finish();
	const header = new PbfWriter();
	header.writeStringField(1, type);
	header.writeVarintField(3, bodyBytes.length);
	const headerBytes = header.finish();
	const length = Buffer.alloc(4);
	length.writeUInt32BE(headerBytes.length);
	return Buffer.concat([length, headerBytes, bodyBytes]);
}
