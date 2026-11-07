# data

The dataset build (spec «Набор данных»). So far: the builder that turns one OSM extract into the road graph and its build report, the zone outlines and the cities file, and the commands around them. The monthly world build in GitHub Actions comes with #35.

## Builder

`buildGraph` in `src/build-graph.ts` reads an OSM file (`src/osm/`: XML for the test fixtures, PBF for extracts) and returns the graph in the format of `engine/src/graph.ts`.

- It picks the roads by their tags (`src/roads.ts`), so a raw Geofabrik extract works as well as one filtered by `osmium tags-filter`. A change to the speeds or to which ways are roads bumps `ENGINE_VERSION` (`engine/AGENTS.md`).
- Coordinates come from the ways when the file carries them (`osmium add-locations-to-ways`), otherwise from the file's nodes. An extract lacks nodes its ways refer to past its edge, so `add-locations-to-ways` runs with `--ignore-missing-nodes`: a road loses its segments to such a node, and a boundary with one is incomplete.
- A zone is a relation with `boundary=administrative`, `admin_level=2` and `ISO3166-1:alpha3`, or one of `SPECIAL_ZONES` in `src/zones.ts`, the cases of #13 by relation id (the world build's `osmium tags-filter` keeps those too). A part of a country (a closed territory, Northern Cyprus) comes before the countries in the graph's zones, so it wins where it lies inside its country's polygon. A relation whose boundary the extract holds only in part (a neighbour at the edge of a country's extract) is left out and reported: its roads get no zone.
- An edge across a border is marked when it passes within 2 km of a `barrier=border_control` node (`src/border-controls.ts`). That mark is all the graph holds of borders: the engine applies the border table in `rules` on every calculation, so a change to the table needs no new graph.
- The build checks the border table first, and its report (`src/border-report.ts`) lists the pairs with passport control whose roads cross nowhere at a border crossing, and the table's open crossings near no road across their border. Both mean a crossing to add to or fix in the table.
- Sized for a part of the world: node ids sit in a hash table and the ways, nodes and segments in typed arrays (`src/node-ids.ts`), outside the JS heap. Europe, ~95 M road nodes, builds on a GitHub runner (`docs/container-bench.md`); the world (~330 M) has not been tried.

## Zone outlines

`zoneOutlines(graph, report.parts)` in `src/outlines.ts` turns the graph's zone polygons into the GeoJSON the screen hatches the closed countries and territories with (#30): a `FeatureCollection` with one `MultiPolygon` feature per zone, its code in `properties.zone`, [lon, lat] to 0.001°.

- Each ring is simplified by Douglas–Peucker to 2 km, and a ring smaller than 2 × 2 km after that (a small island) is left out.
- An outline is the zone as the graph's `ZoneLocator` sees it: the zone's rings by the even-odd rule (`polygon-clipping`'s `xor`), and the parts of countries (`report.parts`: closed territories, Northern Cyprus) cut out of the countries around them, since a part wins. So Northern Cyprus, open for Russians, is not hatched with Cyprus. Countries that overlap in OSM overlap here too.
- OSM's country boundaries run along the territorial waters, so coasts are smooth: Greece with its islands is 14 KB (3 KB in brotli), Cyprus with Northern Cyprus 3 KB; the world should be about 1 MB in brotli.
- The Worker serves the file as a static asset at `/data/zones.json`: `build-graph --outlines` writes it into `web/public/data/` (gitignored), which the client's build copies into `web/dist`.

## Cities file

`buildCities` in `src/cities.ts` makes the cities file the screen picks the cities in the ring from (#32, spec «Файл городов», research in #6): JSON in the format of `src/cities-file.ts` (exported as `data/cities-file`, which the client reads), `{ format: 1, cities: [[id, ru, local, lat, lon, population, zone], …] }`, biggest first.

- The cities are GeoNames' `cities1000` from 15 000 people, without PPLX (sections of cities) and PPLH, PPLQ, PPLW (historical, abandoned, destroyed): about 31 800 in the world, 0.6 MB in brotli.
- `ru` is GeoNames' Russian name (from `alternateNamesV2`: in use, non-colloquial, Cyrillic, preferred, short, shortest, in that order), else Wikidata's Russian label of the item with that GeoNames id (P1566, `src/wikidata.ts`: 400 ids a query, one query at a time, waiting as long as a 429 says), else empty. `local` is GeoNames' `name`.
- `zone` is the graph's: the zone polygon the city is in, as `ZoneLocator` sees it, so Kyrenia is `NX` and Sukhumi `ABKHAZIA` though GeoNames puts them in CY and GE. A city outside every polygon (the West Bank has none in OSM) gets its GeoNames country as alpha-3 (`rules/countries`), and one whose country is no zone is left out and reported.
- The Worker serves the file as a static asset at `/data/cities.json`: `build-cities` writes it into `web/public/data/` (gitignored) for `vite dev` and local builds, like the zone outlines.

## Commands

`pnpm --filter data ring <extract | graph file | URL> --lat <degrees> --lon <degrees> --hours <N> [--closed <alpha-3,…>] [--out <file.geojson>]` is the one-command check of the ticket: it builds the graph of an extract (for example `https://download.geofabrik.de/europe/andorra-latest.osm.pbf`), computes the ring and writes GeoJSON. `build-graph <extract> <out.graph> [--outlines <zones.json>]` writes the graph file, which `ring` also reads, and with `--outlines` the zone outlines, printing their size raw and in brotli. Both print the build report to stderr when they build. pnpm runs both in `data/`; they take a relative path from where pnpm started.

`build-cities <graph file | extract | URL> <out.json> [--cities <cities1000.zip | .txt | URL>] [--names <alternateNamesV2.zip | .txt | URL>,…] [--countries <alpha-2>,…] [--no-wikidata]` writes the cities file with the zones of the graph's polygons and prints how many cities, names and zones it got, and the size raw and in brotli. By default it downloads GeoNames' `cities1000.zip` and `alternateNamesV2.zip` (205 MB, streamed through `unzip -p`): that is the world build's call with the world graph. `--countries` keeps the cities of those GeoNames countries and takes their own files of alternate names (`alternatenames/<alpha-2>.zip`), for a region: `build-cities georgia.graph ../web/public/data/cities.json --countries GE,AM,AZ,TR` takes 5 s, Wikidata included. `--no-wikidata` skips Wikidata.

## Tests

The fixtures in `test/fixtures/` are hand-written OSM XML of a few countries and tens of nodes near the equator, where 0.1° is 11.1 km. Each one's header works out the expected values by hand; a new case extends a fixture's header or gets its own fixture.

- `test/ring.test.ts`: the engine's seam (spec «Решения по тестам», seam 1), borders included. Its border tests build their own small tables with `test/rules.ts`; the closed territories and the zones of #13 use the shipped table.
- `test/build-graph.test.ts`: the graph itself, the PBF reader against the XML, the graph file, the build report.
- `test/outlines.test.ts`: the zone outlines against the graph's `ZoneLocator` on `zones.osm`, and the simplification.
- `test/border-table.test.ts` and `test/data-version.test.ts`: the border table's check and the data version, here because every package's tests run under `data`'s vitest and types.
- `test/cities.test.ts`: the cities file from lines in GeoNames' formats, a double of Wikidata and the zones of `zones.osm`; `test/wikidata.test.ts`: the Wikidata client against a double of the Query Service.
- `test/commands.test.ts`: the commands as processes; `build-cities` reads the small GeoNames files in `test/fixtures/geonames/`.
