# data

The dataset build (spec «Набор данных»). So far: the builder that turns one OSM extract into the road graph and its build report, and the commands around it. The monthly world build in GitHub Actions comes with #35.

## Builder

`buildGraph` in `src/build-graph.ts` reads an OSM file (`src/osm/`: XML for the test fixtures, PBF for extracts) and returns the graph in the format of `engine/src/graph.ts`.

- It picks the roads by their tags (`src/roads.ts`), so a raw Geofabrik extract works as well as one filtered by `osmium tags-filter`. A change to the speeds or to which ways are roads bumps `ENGINE_VERSION` (`engine/AGENTS.md`).
- Coordinates come from the ways when the file carries them (`osmium add-locations-to-ways`), otherwise from the file's nodes. An extract lacks nodes its ways refer to past its edge, so `add-locations-to-ways` runs with `--ignore-missing-nodes`: a road loses its segments to such a node, and a boundary with one is incomplete.
- A zone is a relation with `boundary=administrative`, `admin_level=2` and `ISO3166-1:alpha3`, or one of `SPECIAL_ZONES` in `src/zones.ts`, the cases of #13 by relation id (the world build's `osmium tags-filter` keeps those too). A part of a country (a closed territory, Northern Cyprus) comes before the countries in the graph's zones, so it wins where it lies inside its country's polygon. A relation whose boundary the extract holds only in part (a neighbour at the edge of a country's extract) is left out and reported: its roads get no zone.
- An edge across a border is marked when it passes within 2 km of a `barrier=border_control` node (`src/border-controls.ts`). That mark is all the graph holds of borders: the engine applies the border table in `rules` on every calculation, so a change to the table needs no new graph.
- The build checks the border table first, and its report (`src/border-report.ts`) lists the pairs with passport control whose roads cross nowhere at a border crossing, and the table's open crossings near no road across their border. Both mean a crossing to add to or fix in the table.
- Sized for a part of the world: node ids sit in a hash table and the ways, nodes and segments in typed arrays (`src/node-ids.ts`), outside the JS heap. Europe, ~95 M road nodes, builds on a GitHub runner (`docs/container-bench.md`); the world (~330 M) has not been tried.

## Commands

`pnpm --filter data ring <extract | graph file | URL> --lat <degrees> --lon <degrees> --hours <N> [--closed <alpha-3,…>] [--out <file.geojson>]` is the one-command check of the ticket: it builds the graph of an extract (for example `https://download.geofabrik.de/europe/andorra-latest.osm.pbf`), computes the ring and writes GeoJSON. `build-graph <extract> <out.graph>` writes the graph file, which `ring` also reads. Both print the build report to stderr when they build. pnpm runs both in `data/`; they take a relative path from where pnpm started.

## Tests

The fixtures in `test/fixtures/` are hand-written OSM XML of a few countries and tens of nodes near the equator, where 0.1° is 11.1 km. Each one's header works out the expected values by hand; a new case extends a fixture's header or gets its own fixture.

- `test/ring.test.ts`: the engine's seam (spec «Решения по тестам», seam 1), borders included. Its border tests build their own small tables with `test/rules.ts`; the closed territories and the zones of #13 use the shipped table.
- `test/build-graph.test.ts`: the graph itself, the PBF reader against the XML, the graph file, the build report.
- `test/border-table.test.ts` and `test/data-version.test.ts`: the border table's check and the data version, here because every package's tests run under `data`'s vitest and types.
- `test/commands.test.ts`: the commands as processes.
