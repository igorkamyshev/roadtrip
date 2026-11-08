// OSM PBF (https://wiki.openstreetmap.org/wiki/PBF_Format), read block by block from disk, so a file larger than
// memory streams through. Reads ways with their own locations (the `LocationsOnWays` feature of
// `osmium add-locations-to-ways`), which the world build uses (spec «Набор данных»).
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PbfReader } from 'pbf';
import type { OsmMember, OsmSource, OsmVisitor, Tags } from './source.ts';

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
				let position = 0;
				const take = (length: number) => {
					const bytes = Buffer.alloc(length);
					if (readSync(file, bytes, 0, length, position) !== length) {
						throw new Error(`${path} ends inside a block`);
					}
					position += length;
					return bytes;
				};
				while (position < size) {
					const header = readBlobHeader(take(take(4).readUInt32BE(0)));
					const data = readBlob(take(header.dataSize));
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

function readBlob(bytes: Uint8Array): Uint8Array {
	const blob = new PbfReader(bytes).readFields(
		(tag, result, pbf) => {
			if (tag === 1 || tag === 3) {
				result.data = pbf.readBytes();
				result.zlib = tag === 3;
			} else if (tag >= 4) {
				throw new Error('PBF blob compressed other than with zlib');
			}
		},
		{ data: new Uint8Array(0) as Uint8Array, zlib: false },
	);
	return blob.zlib ? inflateSync(blob.data) : blob.data;
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

function readPrimitiveBlock(bytes: Uint8Array, visitor: OsmVisitor): void {
	const pbf = new PbfReader(bytes);
	const block = pbf.readFields(
		(tag, result, reader) => {
			if (tag === 1) {
				const end = reader.readVarint() + reader.pos;
				reader.readFields(
					(stringTag, strings, stringReader) => stringTag === 1 && strings.push(stringReader.readString()),
					result.strings,
					end,
				);
			} else if (tag === 2) {
				const end = reader.readVarint() + reader.pos;
				result.groups.push([reader.pos, end]);
				reader.pos = end;
			} else if (tag === 17) {
				result.granularity = reader.readVarint();
			} else if (tag === 19) {
				result.latOffset = reader.readVarint(true);
			} else if (tag === 20) {
				result.lonOffset = reader.readVarint(true);
			}
		},
		{ strings: [], granularity: 100, latOffset: 0, lonOffset: 0, groups: [] } as Block,
	);
	// Coordinates in 1e-7 degrees: the file's are in units of `granularity` nanodegrees past the offset.
	const lat = (value: number) => Math.round((block.latOffset + block.granularity * value) / 100);
	const lon = (value: number) => Math.round((block.lonOffset + block.granularity * value) / 100);
	const located = (coordinate: (value: number) => number) => (value: number) => {
		const e7 = coordinate(value);
		return e7 === UNDEFINED_COORDINATE ? Number.NaN : e7;
	};
	const tags = (keys: number[], values: number[]): Tags => {
		if (keys.length === 0) {
			return NO_TAGS;
		}
		// A loop, not Object.fromEntries: a quarter of a build's time went there, once per way.
		const result: Record<string, string> = {};
		for (let index = 0; index < keys.length; index++) {
			result[block.strings[keys[index]]] = block.strings[values[index]];
		}
		return result;
	};

	for (const [start, end] of block.groups) {
		pbf.pos = start;
		pbf.readFields(
			(tag, _, reader) => {
				if (tag === 2 && visitor.node) {
					readDenseNodes(reader, block, lat, lon, visitor.node);
				} else if (tag === 1 && visitor.node) {
					const node = reader.readMessage(readNodeField, { id: 0, keys: [], values: [], lat: 0, lon: 0 });
					visitor.node({ id: node.id, lat: lat(node.lat), lon: lon(node.lon), tags: tags(node.keys, node.values) });
				} else if (tag === 3 && visitor.way) {
					const way = reader.readMessage(readWayField, { id: 0, keys: [], values: [], refs: [], lat: [], lon: [] });
					visitor.way({
						id: way.id,
						refs: undelta(way.refs),
						tags: tags(way.keys, way.values),
						locations:
							way.lat.length === 0 ? undefined : { lat: undelta(way.lat).map(located(lat)), lon: undelta(way.lon).map(located(lon)) },
					});
				} else if (tag === 4 && visitor.relation) {
					const relation = reader.readMessage(readRelationField, { id: 0, keys: [], values: [], roles: [], members: [], types: [] });
					const members = undelta(relation.members);
					visitor.relation({
						id: relation.id,
						tags: tags(relation.keys, relation.values),
						members: members.map((ref, index) => ({
							type: MEMBER_TYPES[relation.types[index]],
							ref,
							role: block.strings[relation.roles[index]],
						})),
					});
				}
			},
			null,
			end,
		);
	}
}

function readDenseNodes(
	reader: PbfReader,
	block: Block,
	lat: (value: number) => number,
	lon: (value: number) => number,
	visit: NonNullable<OsmVisitor['node']>,
): void {
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
				nodeTags[block.strings[dense.keysValues[keyValue]]] = block.strings[dense.keysValues[keyValue + 1]];
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
	const values = new Array<number>(deltas.length);
	let value = 0;
	for (let index = 0; index < deltas.length; index++) {
		value += deltas[index];
		values[index] = value;
	}
	return values;
}
