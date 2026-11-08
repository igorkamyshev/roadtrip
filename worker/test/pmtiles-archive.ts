// Writes a PMTiles v3 archive (https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md) for the tests of
// the tiles route: the header, one root directory and the tiles, gzipped as Protomaps' builds are. The tiles hold
// whatever bytes a test gives them: the route serves them and never parses them.
import { gzipSync } from 'node:zlib';
import { zxyToTileId } from 'pmtiles';

const HEADER_BYTES = 127;
const COMPRESSION_GZIP = 2;
const TILE_TYPE_MVT = 1;

export interface ArchiveTile {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	/** The tile as the route must serve it (the archive holds it gzipped). */
	readonly data: string;
}

export interface ArchiveOptions {
	readonly minZoom: number;
	readonly maxZoom: number;
}

export function pmtilesArchive(tiles: readonly ArchiveTile[], { minZoom, maxZoom }: ArchiveOptions): Uint8Array {
	const entries = tiles
		.map((tile) => ({ tileId: zxyToTileId(tile.z, tile.x, tile.y), data: gzipSync(tile.data) }))
		.sort((a, b) => a.tileId - b.tileId);
	let offset = 0;
	const placed = entries.map((entry) => {
		const at = offset;
		offset += entry.data.length;
		return { ...entry, offset: at };
	});
	const directory = gzipSync(serializeDirectory(placed));
	const metadata = gzipSync(JSON.stringify({ name: 'fixture' }));
	const tileData = Buffer.concat(placed.map((entry) => entry.data));

	const rootOffset = HEADER_BYTES;
	const metadataOffset = rootOffset + directory.length;
	const leavesOffset = metadataOffset + metadata.length;
	const tilesOffset = leavesOffset;

	const header = new DataView(new ArrayBuffer(HEADER_BYTES));
	new TextEncoder().encodeInto('PMTiles', new Uint8Array(header.buffer));
	header.setUint8(7, 3);
	const u64 = (at: number, value: number) => {
		header.setBigUint64(at, BigInt(value), true);
	};
	u64(8, rootOffset);
	u64(16, directory.length);
	u64(24, metadataOffset);
	u64(32, metadata.length);
	u64(40, leavesOffset);
	u64(48, 0);
	u64(56, tilesOffset);
	u64(64, tileData.length);
	u64(72, placed.length);
	u64(80, placed.length);
	u64(88, placed.length);
	header.setUint8(96, 1);
	header.setUint8(97, COMPRESSION_GZIP);
	header.setUint8(98, COMPRESSION_GZIP);
	header.setUint8(99, TILE_TYPE_MVT);
	header.setUint8(100, minZoom);
	header.setUint8(101, maxZoom);
	header.setInt32(102, -180e7, true);
	header.setInt32(106, -85e7, true);
	header.setInt32(110, 180e7, true);
	header.setInt32(114, 85e7, true);

	// A Uint8Array of its own: a Buffer may be a view into a shared pool.
	return Uint8Array.from(Buffer.concat([new Uint8Array(header.buffer), directory, metadata, tileData]));
}

/** A directory: the count, then the tile ids as deltas, run lengths, lengths and offsets + 1, each a varint. */
function serializeDirectory(entries: readonly { tileId: number; offset: number; data: Uint8Array }[]): Uint8Array {
	const bytes: number[] = [];
	const varint = (value: number) => {
		let rest = value;
		while (rest >= 0x80) {
			bytes.push((rest % 0x80) | 0x80);
			rest = Math.floor(rest / 0x80);
		}
		bytes.push(rest);
	};
	varint(entries.length);
	let previous = 0;
	for (const { tileId } of entries) {
		varint(tileId - previous);
		previous = tileId;
	}
	for (const _ of entries) {
		varint(1);
	}
	for (const { data } of entries) {
		varint(data.length);
	}
	for (const { offset } of entries) {
		varint(offset + 1);
	}
	return new Uint8Array(bytes);
}
