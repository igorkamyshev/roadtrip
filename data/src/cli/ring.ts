// Computes a ring from an OSM extract (one country from Geofabrik, say) or a graph file, and writes it as GeoJSON:
// a FeatureCollection of one Feature, the ring (or no geometry), with the engine's result in its properties.
//
//   pnpm --filter data ring <extract.osm.pbf | graph file | URL> --lat <degrees> --lon <degrees> --hours <N>
//       [--closed <alpha-3,alpha-3,…>] [--out <file.geojson>]
//
// For example, with https://download.geofabrik.de/europe/andorra-latest.osm.pbf, --lat 42.5063 --lon 1.5218 --hours 2.
// `--closed` lists the closed countries; those the border table closes for everyone are closed anyway.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { computeRing, ENGINE_VERSION } from 'engine';
import { borderTable } from 'rules';
import { log, userPath, withLocalFile, withNegativeValues } from './input.ts';
import { loadGraph } from './load-graph.ts';

const { values, positionals } = parseArgs({
	args: withNegativeValues(process.argv.slice(2), ['--lat', '--lon']),
	allowPositionals: true,
	options: {
		lat: { type: 'string' },
		lon: { type: 'string' },
		hours: { type: 'string' },
		closed: { type: 'string' },
		out: { type: 'string' },
	},
});
const input = positionals.at(0);
const [lat, lon, hours] = [values.lat, values.lon, values.hours].map(Number);
if (input === undefined || ![lat, lon, hours].every((value) => Number.isFinite(value))) {
	log(
		'usage: pnpm --filter data ring <extract.osm.pbf | graph file | URL> --lat <degrees> --lon <degrees> --hours <N> ' +
			'[--closed <alpha-3,alpha-3,…>] [--out <file.geojson>]',
	);
	process.exit(2);
}

const { graph } = await withLocalFile(input, loadGraph);
const closedCountries = values.closed?.split(',').filter((code) => code !== '') ?? [];
const result = computeRing(graph, borderTable, { origin: { lat, lon }, hours, closedCountries });
const { outcome, startCountry, timings } = result;
log(
	`${outcome}, start country ${startCountry ?? 'none'}` +
		(result.outcome === 'ring' ? `, ${result.ring.coordinates.length} polygons` : '') +
		(result.outcome === 'empty' ? `, maxHours ${result.maxHours}` : '') +
		`; traversal ${timings.traversalMs.toFixed(0)} ms, contour ${timings.contourMs.toFixed(0)} ms`,
);
const geojson = JSON.stringify({
	type: 'FeatureCollection',
	features: [
		{
			type: 'Feature',
			geometry: result.outcome === 'ring' ? result.ring : null,
			properties: {
				outcome,
				startCountry,
				maxHours: result.outcome === 'empty' ? result.maxHours : undefined,
				origin: { lat, lon },
				hours,
				closedCountries,
				engineVersion: ENGINE_VERSION,
				timings,
			},
		},
	],
});
if (values.out === undefined) {
	process.stdout.write(`${geojson}\n`);
} else {
	writeFileSync(userPath(values.out), geojson);
	log(`wrote ${values.out}`);
}
