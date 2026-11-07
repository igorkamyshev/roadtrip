// Builds the road graph of an OSM extract and writes it as a graph file.
//
//   pnpm --filter data build-graph <extract.osm.pbf | URL> <out.graph>
import { writeFileSync } from 'node:fs';
import { encodeGraph } from 'engine/graph';
import { loadGraph, log, userPath, withLocalFile } from './input.ts';

const [extract, out] = process.argv.slice(2);
if (extract === undefined || out === undefined) {
	log('usage: pnpm --filter data build-graph <extract.osm.pbf | URL> <out.graph>');
	process.exit(2);
}
const { graph } = await withLocalFile(extract, loadGraph);
const bytes = encodeGraph(graph);
writeFileSync(userPath(out), bytes);
log(`wrote ${out}: ${(bytes.length / 1e6).toFixed(1)} MB`);
