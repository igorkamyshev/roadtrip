# data

The dataset build (spec «Набор данных»). So far: the builder that turns one OSM extract into the road graph, and the commands around it. The monthly world build in GitHub Actions comes with #35; zones by #13, border pairs on edges and the build report with #23.

## Builder

`buildGraph` in `src/build-graph.ts` reads an OSM file (`src/osm/`: XML for the test fixtures, PBF for extracts) and returns the graph in the format of `engine/src/graph.ts`.

- It picks the roads by their tags (`src/roads.ts`), so a raw Geofabrik extract works as well as one filtered by `osmium tags-filter`. A change to the speeds or to which ways are roads bumps `ENGINE_VERSION` (`engine/AGENTS.md`).
- Coordinates come from the ways when the file carries them (`osmium add-locations-to-ways`), otherwise from the file's nodes.
- A zone is a relation with `boundary=administrative`, `admin_level=2` and `ISO3166-1:alpha3`. A relation whose boundary the extract holds only in part (a neighbour at the edge of a country's extract) is left out and reported: its roads get no zone.
- Sized for a country: node ids sit in a JS `Map` and every road segment in JS arrays. The world (~330 M nodes) needs another layout for these before #35 runs it.

## Commands

`pnpm --filter data ring <extract | graph file | URL> --lat <degrees> --lon <degrees> --hours <N> [--out <file.geojson>]` is the one-command check of the ticket: it builds the graph of an extract (for example `https://download.geofabrik.de/europe/andorra-latest.osm.pbf`), computes the ring and writes GeoJSON. `build-graph <extract> <out.graph>` writes the graph file, which `ring` also reads. pnpm runs both in `data/`; they take a relative path from where pnpm started.

## Tests

The fixtures in `test/fixtures/` are hand-written OSM XML of a few countries and tens of nodes near the equator, where 0.1° is 11.1 km. Each one's header works out the expected values by hand; a new case extends a fixture's header or gets its own fixture.

- `test/ring.test.ts`: the engine's seam (spec «Решения по тестам», seam 1).
- `test/build-graph.test.ts`: the graph itself, the PBF reader against the XML, the graph file.
- `test/commands.test.ts`: the commands as processes.
