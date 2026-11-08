// OSM PBF (https://wiki.openstreetmap.org/wiki/PBF_Format), read block by block from disk, so a file larger than
// memory streams through. Reads ways with their own locations (the `LocationsOnWays` feature of
// `osmium add-locations-to-ways`), which the world build uses (spec «Набор данных»).
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PbfReader } from 'pbf';
import type { OsmMember, OsmNode, OsmRelation, OsmSource, OsmVisitor, OsmWay, Tags } from './source.ts';

const SUPPORTED_FEATURES = new Set(['OsmSchema-V0.6', 'DenseNodes']);
const MEMBER_TYPES: readonly OsmMember['type'][] = ['node', 'way', 'relation'];
const NO_TAGS: Tags = Object.freeze({});
/**
 * The coordinate libosmium writes for an undefined location, in 1e-7 degrees (INT32_MAX): what
 * `osmium add-locations-to-ways --ignore-missing-nodes` puts on a way for a node the extract lacks.
 */
const UNDEFINED_COORDINATE = 2_147_483_647;

export function openOsmPbf(path: string): OsmSource {
	return {
		read(visitor) {
			const file = openSync(path, 'r');
			try {
				const size = fstatSync(file).size;
				const take = (position: number, length: number) => {
					const bytes = Buffer.alloc(length);
					if (readSync(file, bytes, 0, length, position) !== length) {
						throw new Error(`${path} ends inside a block`);
					}
					return bytes;
				};
				let position = 0;
				while (position < size) {
					const headerSize = take(position, 4).readUInt32BE(0);
					const header = readBlobHeader(take(position + 4, headerSize));
					const data = readBlob(take(position + 4 + headerSize, header.dataSize));
					position += 4 + headerSize + header.dataSize;
					if (header.type === 'OSMHeader') {
						checkFeatures(data, path);
					} else if (header.type === 'OSMData') {
						readPrimitiveBlock(data, visitor);
					}
				}
			} finally {
				closeSync(file);
			}
		},
	};
}

function readBlobHeader(bytes: Uint8Array): { type: string; dataSize: number } {
	return new PbfReader(bytes).readFields(
		(tag, header, pbf) => {
			if (tag === 1) {
				header.type = pbf.readString();
			} else if (tag === 3) {
				header.dataSize = pbf.readVarint();
			}
		},
		{ type: '', dataSize: 0 },
	);
}

interface Blob {
	data: Uint8Array;
	zlib: boolean;
}

function readBlob(bytes: Uint8Array): Uint8Array {
	const blob = new PbfReader(bytes).readFields(readBlobField, { data: new Uint8Array(0), zlib: false });
	return blob.zlib ? inflateSync(blob.data) : blob.data;
}

function readBlobField(tag: number, blob: Blob, pbf: PbfReader): void {
	if (tag === 1 || tag === 3) {
		blob.data = pbf.readBytes();
		blob.zlib = tag === 3;
	} else if (tag >= 4) {
		throw new Error('PBF blob compressed other than with zlib');
	}
}

function checkFeatures(bytes: Uint8Array, path: string): void {
	new PbfReader(bytes).readFields((tag, _, pbf) => {
		if (tag === 4) {
			const feature = pbf.readString();
			if (!SUPPORTED_FEATURES.has(feature)) {
				throw new Error(`${path} requires the PBF feature ${feature}`);
			}
		}
	}, null);
}

interface Block {
	strings: string[];
	granularity: number;
	latOffset: number;
	lonOffset: number;
	groups: [number, number][];
}

function readBlockField(tag: number, block: Block, pbf: PbfReader): void {
	if (tag === 1) {
		const end = pbf.readVarint() + pbf.pos;
		pbf.readFields(readStringTableField, block.strings, end);
	} else if (tag === 2) {
		const end = pbf.readVarint() + pbf.pos;
		block.groups.push([pbf.pos, end]);
		pbf.pos = end;
	} else if (tag === 17) {
		block.granularity = pbf.readVarint();
	} else if (tag === 19) {
		block.latOffset = pbf.readVarint(true);
	} else if (tag === 20) {
		block.lonOffset = pbf.readVarint(true);
	}
}

function readStringTableField(tag: number, strings: string[], pbf: PbfReader): void {
	if (tag === 1) {
		strings.push(pbf.readString());
	}
}

/** What reading a block's elements takes: its strings, its coordinates in 1e-7 degrees, and the visitor. */
interface Elements {
	readonly strings: readonly string[];
	readonly lat: (value: number) => number;
	readonly lon: (value: number) => number;
	readonly visitor: OsmVisitor;
}

function readPrimitiveBlock(bytes: Uint8Array, visitor: OsmVisitor): void {
	const pbf = new PbfReader(bytes);
	const empty: Block = { strings: [], granularity: 100, latOffset: 0, lonOffset: 0, groups: [] };
	const block = pbf.readFields(readBlockField, empty);
	// Coordinates in 1e-7 degrees: the file's are in units of `granularity` nanodegrees past the offset.
	const elements: Elements = {
		strings: block.strings,
		lat: (value) => Math.round((block.latOffset + block.granularity * value) / 100),
		lon: (value) => Math.round((block.lonOffset + block.granularity * value) / 100),
		visitor,
	};
	for (const [start, end] of block.groups) {
		pbf.pos = start;
		pbf.readFields(
			(tag, _, reader) => {
				readElement(tag, reader, elements);
			},
			null,
			end,
		);
	}
}

/** Reads a primitive group's field `tag` for the visitor: nodes, dense or not, a way or a relation. */
function readElement(tag: number, reader: PbfReader, elements: Elements): void {
	const { visitor } = elements;
	if (tag === 2 && visitor.node) {
		readDenseNodes(reader, elements, visitor.node);
	} else if (tag === 1 && visitor.node) {
		visitor.node(readNode(reader, elements));
	} else if (tag === 3 && visitor.way) {
		visitor.way(readWay(reader, elements));
	} else if (tag === 4 && visitor.relation) {
		visitor.relation(readRelation(reader, elements));
	}
}

function readNode(reader: PbfReader, { strings, lat, lon }: Elements): OsmNode {
	const node = reader.readMessage(readNodeField, { id: 0, keys: [], values: [], lat: 0, lon: 0 });
	return { id: node.id, lat: lat(node.lat), lon: lon(node.lon), tags: tagsOf(strings, node.keys, node.values) };
}

function readWay(reader: PbfReader, { strings, lat, lon }: Elements): OsmWay {
	const way = reader.readMessage(readWayField, { id: 0, keys: [], values: [], refs: [], lat: [], lon: [] });
	return {
		id: way.id,
		refs: undelta(way.refs),
		tags: tagsOf(strings, way.keys, way.values),
		locations: way.lat.length === 0 ? undefined : { lat: undelta(way.lat).map(located(lat)), lon: undelta(way.lon).map(located(lon)) },
	};
}

function readRelation(reader: PbfReader, { strings }: Elements): OsmRelation {
	const relation = reader.readMessage(readRelationField, { id: 0, keys: [], values: [], roles: [], members: [], types: [] });
	const members = undelta(relation.members);
	return {
		id: relation.id,
		tags: tagsOf(strings, relation.keys, relation.values),
		members: members.map((ref, index) => ({
			type: MEMBER_TYPES[relation.types[index]],
			ref,
			role: strings[relation.roles[index]],
		})),
	};
}

/** A coordinate as `coordinate` reads it, or NaN for the one libosmium writes for a node the extract lacks. */
function located(coordinate: (value: number) => number): (value: number) => number {
	return (value) => {
		const e7 = coordinate(value);
		return e7 === UNDEFINED_COORDINATE ? Number.NaN : e7;
	};
}

/** An element's tags from its keys and values, indexes into the block's strings. */
function tagsOf(strings: readonly string[], keys: readonly number[], values: readonly number[]): Tags {
	if (keys.length === 0) {
		return NO_TAGS;
	}
	// A loop, not Object.fromEntries: a quarter of a build's time went there, once per way.
	const result: Record<string, string> = {};
	for (let index = 0; index < keys.length; index++) {
		result[strings[keys[index]]] = strings[values[index]];
	}
	return result;
}

function readDenseNodes(reader: PbfReader, { strings, lat, lon }: Elements, visit: NonNullable<OsmVisitor['node']>): void {
	const dense = reader.readMessage(
		(tag, result, pbf) => {
			if (tag === 1) {
				pbf.readPackedSVarint(result.ids);
			} else if (tag === 8) {
				pbf.readPackedSVarint(result.lat);
			} else if (tag === 9) {
				pbf.readPackedSVarint(result.lon);
			} else if (tag === 10) {
				pbf.readPackedVarint(result.keysValues);
			}
		},
		{ ids: [] as number[], lat: [] as number[], lon: [] as number[], keysValues: [] as number[] },
	);
	let id = 0;
	let nodeLat = 0;
	let nodeLon = 0;
	let keyValue = 0;
	for (let index = 0; index < dense.ids.length; index++) {
		id += dense.ids[index];
		nodeLat += dense.lat[index];
		nodeLon += dense.lon[index];
		let tags = NO_TAGS;
		if (keyValue < dense.keysValues.length) {
			const nodeTags: Record<string, string> = {};
			while (dense.keysValues[keyValue] !== 0) {
				nodeTags[strings[dense.keysValues[keyValue]]] = strings[dense.keysValues[keyValue + 1]];
				keyValue += 2;
			}
			keyValue++;
			tags = Object.keys(nodeTags).length === 0 ? NO_TAGS : nodeTags;
		}
		visit({ id, lat: lat(nodeLat), lon: lon(nodeLon), tags });
	}
}

interface Element {
	id: number;
	keys: number[];
	values: number[];
}

function readNodeField(tag: number, node: Element & { lat: number; lon: number }, pbf: PbfReader): void {
	if (tag === 1) {
		node.id = pbf.readSVarint();
	} else if (tag === 2) {
		pbf.readPackedVarint(node.keys);
	} else if (tag === 3) {
		pbf.readPackedVarint(node.values);
	} else if (tag === 8) {
		node.lat = pbf.readSVarint();
	} else if (tag === 9) {
		node.lon = pbf.readSVarint();
	}
}

function readWayField(tag: number, way: Element & { refs: number[]; lat: number[]; lon: number[] }, pbf: PbfReader): void {
	if (tag === 1) {
		way.id = pbf.readVarint();
	} else if (tag === 2) {
		pbf.readPackedVarint(way.keys);
	} else if (tag === 3) {
		pbf.readPackedVarint(way.values);
	} else if (tag === 8) {
		pbf.readPackedSVarint(way.refs);
	} else if (tag === 9) {
		pbf.readPackedSVarint(way.lat);
	} else if (tag === 10) {
		pbf.readPackedSVarint(way.lon);
	}
}

function readRelationField(tag: number, relation: Element & { roles: number[]; members: number[]; types: number[] }, pbf: PbfReader): void {
	if (tag === 1) {
		relation.id = pbf.readVarint();
	} else if (tag === 2) {
		pbf.readPackedVarint(relation.keys);
	} else if (tag === 3) {
		pbf.readPackedVarint(relation.values);
	} else if (tag === 8) {
		pbf.readPackedVarint(relation.roles);
	} else if (tag === 9) {
		pbf.readPackedSVarint(relation.members);
	} else if (tag === 10) {
		pbf.readPackedVarint(relation.types);
	}
}

/** Running sums of delta-coded values. */
function undelta(deltas: readonly number[]): number[] {
	let value = 0;
	return deltas.map((delta) => {
		value += delta;
		return value;
	});
}
