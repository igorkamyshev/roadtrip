// Builds the graph file of a region from country extracts, filtered as the world build filters its parts (the job
// `extract` of .github/workflows/dataset.yml): roads from motorway to tertiary with their links, border checkpoints,
// the countries' boundaries and the zones of #13. For rings on real roads, before and after a change of the engine.
//
//   pnpm --filter data region <out.graph> <part | URL>… [--mirror <url>]
//
// A part is a path in Geofabrik's layout, `europe/austria`, downloaded as <mirror>/<part>-latest.osm.pbf, from
// https://download.geofabrik.de by default (AGENTS.md, «Commands», says which mirror a cloud session reaches). Needs
// osmium-tool on PATH and twice the largest extract's size on disk.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { encodeGraph } from 'engine/graph';
import { CLASS_SPEED_KMH } from '../roads.ts';
import { SPECIAL_ZONES } from '../zones.ts';
import { log, seconds, userPath, withLocalFile } from './input.ts';
import { loadGraph } from './load-graph.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { mirror: { type: 'string' } } });
const out = positionals.at(0);
const parts = positionals.slice(1);
if (out === undefined || !out.endsWith('.graph') || parts.length === 0) {
	log('usage: pnpm --filter data region <out.graph> <part | URL>… [--mirror <url>]');
	process.exit(2);
}
const mirror = (values.mirror ?? 'https://download.geofabrik.de').replace(/\/$/u, '');

const work = mkdtempSync(join(tmpdir(), 'roadtrip-region-'));
try {
	const filtered: string[] = [];
	for (const [index, part] of parts.entries()) {
		const url = /^https?:\/\//u.test(part) ? part : `${mirror}/${part}-latest.osm.pbf`;
		const kept = join(work, `${index}.pbf`);
		await withLocalFile(url, (raw) => {
			keepWhatTheBuilderReads(raw, kept);
		});
		filtered.push(kept);
	}
	const merged = join(work, 'merged.pbf');
	osmium(['merge', '--overwrite', ...filtered, '-o', merged]);
	const extract = join(work, 'region.osm.pbf');
	osmium(['add-locations-to-ways', '--overwrite', '--ignore-missing-nodes', merged, '-o', extract]);
	const bytes = encodeGraph(loadGraph(extract).graph);
	writeFileSync(userPath(out), bytes);
	log(`wrote ${out}: ${(bytes.length / 1e6).toFixed(1)} MB`);
} finally {
	rmSync(work, { recursive: true, force: true });
}

/** The roads, border checkpoints and zones of the extract at `raw`, written to `kept`. */
function keepWhatTheBuilderReads(raw: string, kept: string): void {
	const started = performance.now();
	const roads = `${kept}.roads.pbf`;
	osmium([
		'tags-filter',
		'--overwrite',
		raw,
		`w/highway=${Object.keys(CLASS_SPEED_KMH).join(',')}`,
		'n/barrier=border_control',
		'r/admin_level=2',
		'-o',
		roads,
	]);
	const zones = `${kept}.zones.pbf`;
	try {
		osmium(['getid', '--overwrite', '-r', raw, ...[...SPECIAL_ZONES.keys()].map((id) => `r${id}`), '-o', zones]);
	} catch (error) {
		// osmium exits 1 when the extract lacks some of them, as most do, and writes those it has.
		if (statSync(zones, { throwIfNoEntry: false }) === undefined) {
			throw error;
		}
	}
	osmium(['merge', '--overwrite', roads, zones, '-o', kept]);
	rmSync(roads);
	rmSync(zones);
	log(`kept the roads, border checkpoints and zones of ${raw} in ${seconds(started)}`);
}

/** Runs osmium; its error carries what osmium printed. */
function osmium(args: string[]): void {
	execFileSync('osmium', args, { stdio: ['ignore', 'ignore', 'pipe'] });
}
