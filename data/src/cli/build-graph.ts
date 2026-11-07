// Builds the road graph of an OSM extract and writes it as a graph file, and with --outlines the zone outlines the
// screen hatches closed countries with (GeoJSON, a static asset of the Worker).
//
//   pnpm --filter data build-graph <extract.osm.pbf | URL> <out.graph> [--outlines <zones.json>]
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { brotliCompressSync } from 'node:zlib';
import { encodeGraph } from 'engine/graph';
import { zoneOutlines } from '../outlines.ts';
import { loadGraph, log, seconds, userPath, withLocalFile } from './input.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { outlines: { type: 'string' } } });
const [extract, out] = positionals;
if (extract === undefined || out === undefined || extract.endsWith('.graph')) {
	log('usage: pnpm --filter data build-graph <extract.osm.pbf | URL> <out.graph> [--outlines <zones.json>]');
	process.exit(2);
}
const { graph, report } = await withLocalFile(extract, loadGraph);
const bytes = encodeGraph(graph);
writeFileSync(userPath(out), bytes);
log(`wrote ${out}: ${(bytes.length / 1e6).toFixed(1)} MB`);

if (values.outlines !== undefined && report !== undefined) {
	const started = performance.now();
	const json = JSON.stringify(zoneOutlines(graph, report.parts));
	writeFileSync(userPath(values.outlines), json);
	log(
		`wrote ${values.outlines} in ${seconds(started)}: ${(json.length / 1e6).toFixed(2)} MB, ` +
			`${(brotliCompressSync(json).length / 1e6).toFixed(2)} MB in brotli`,
	);
}
