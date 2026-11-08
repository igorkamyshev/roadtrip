# data

The dataset build (spec «Набор данных»): the builder that turns an OSM extract into the road graph and its build report, the zone outlines, the cities file, the commands around them, and the monthly world build in GitHub Actions that puts the dataset in R2.

## Builder

`buildGraph` in `src/build-graph.ts` reads an OSM file (`src/osm/`: XML for the test fixtures, PBF for extracts) and returns the graph in the format of `engine/src/graph.ts`.

- It picks the roads by their tags (`src/roads.ts`), so a raw Geofabrik extract works as well as one filtered by `osmium tags-filter`. A change to the speeds or to which ways are roads bumps `ENGINE_VERSION` (`engine/AGENTS.md`).
- Coordinates come from the ways when the file carries them (`osmium add-locations-to-ways`), otherwise from the file's nodes. An extract lacks nodes its ways refer to past its edge, so `add-locations-to-ways` runs with `--ignore-missing-nodes`: a road loses its segments to such a node, and a boundary with one is incomplete.
- A zone is a relation with `boundary=administrative`, `admin_level=2` and `ISO3166-1:alpha3`, or one of `SPECIAL_ZONES` in `src/zones.ts`, the cases of #13 by relation id (the world build's `osmium tags-filter` keeps those too). A part of a country (a closed territory, Northern Cyprus) comes before the countries in the graph's zones, so it wins where it lies inside its country's polygon. A zone is made of the rings of its relation that the extract holds whole; a ring with a way or a node the extract lacks is left out, and the report lists the zone as partial (the world's USA: its boundary around Kingman Reef and Johnston Atoll is in no part of Geofabrik's). A relation with no whole ring but holes (a neighbour at the edge of a country's extract) is left out and reported: its roads get no zone.
- An edge across a border is marked when it passes within 2 km of a `barrier=border_control` node (`src/border-controls.ts`). That mark is all the graph holds of borders: the engine applies the border table in `rules` on every calculation, so a change to the table needs no new graph.
- The build checks the border table first, and its report (`src/border-report.ts`) lists the pairs with passport control whose roads cross nowhere at a border crossing, and the table's open crossings near no road across their border. Both mean a crossing to add to or fix in the table. `src/build-report.ts` writes the report as Markdown, in Russian, for the world build's summary.
- Sized for the world, ~330 M road nodes before collapsing, in typed arrays outside the JS heap (`src/node-ids.ts`). No node is kept by its id but the ones that stay in the graph. The first pass over the ways puts every road node's id in `RepeatedIds` (sorted chunks, 8 bytes an id), which finds the ones at a junction. The second cuts each way into pieces at those, at its ends, at a node next to one the file lacks and wherever `collapse` keeps a node; only the pieces' end nodes get a number. `collapse` then joins the pieces across ways into edges. Without locations on the ways, the road nodes' coordinates are kept by id, as for a country's raw extract.
- A road node's zone comes from `ZoneCells` (`src/zone-cells.ts`): once per 0.05° cell no zone boundary crosses, by `ZoneLocator` in the cells one does. `docs/world-build.md` has the world's numbers.

## Zone outlines

`zoneOutlines(graph, report.parts)` in `src/outlines.ts` turns the graph's zone polygons into the GeoJSON the screen hatches the closed countries and territories with (#30): a `FeatureCollection` with one `MultiPolygon` feature per zone, its code in `properties.zone`, [lon, lat] to 0.001°.

- Each ring is simplified by Douglas–Peucker to 2 km, and a ring smaller than 2 × 2 km after that (a small island) is left out.
- An outline is the zone as the graph's `ZoneLocator` sees it: the zone's rings by the even-odd rule (`polygon-clipping`'s `xor`), and the parts of countries (`report.parts`: closed territories, Northern Cyprus) cut out of the countries around them, since a part wins. So Northern Cyprus, open for Russians, is not hatched with Cyprus. Countries that overlap in OSM overlap here too.
- OSM's country boundaries run along the territorial waters, so coasts are smooth: Greece with its islands is 14 KB (3 KB in brotli), Cyprus with Northern Cyprus 3 KB; the world should be about 1 MB in brotli.
- The Worker serves the file as a static asset at `/data/zones.json`: `build-graph --outlines` writes it into `web/public/data/` (gitignored), which the client's build copies into `web/dist`.

## Cities file

`buildCities` in `src/cities.ts` makes the cities file the screen picks the cities in the ring from (#32, spec «Файл городов», research in #6): JSON in the format of `src/cities-file.ts` (exported as `data/cities-file`, which the client reads), `{ format: 1, cities: [[id, ru, local, lat, lon, population, zone], …] }`. `encodeCities` writes the rows in order of id, each id as its difference from the row before's, which takes the world's file from 0.69 MB to 0.58 MB in brotli; `decodeCities` reads them back biggest first.

- The cities are GeoNames' `cities1000` from 15 000 people, without PPLX (sections of cities) and PPLH, PPLQ, PPLW (historical, abandoned, destroyed). The world on 2026-11-07: 31 795 cities, 21 097 of them with a Russian name (17 756 GeoNames', 3 341 Wikidata's), 0.60 MB in brotli, built in 98 s, Wikidata's 36 queries included (none answered 429).
- `ru` is GeoNames' Russian name (from `alternateNamesV2`: in use, non-colloquial, Cyrillic, preferred, short, shortest, in that order), else Wikidata's Russian label of the item with that GeoNames id (P1566, `src/wikidata.ts`: 400 ids a query, one query at a time, waiting as long as a 429 says), else empty. `local` is GeoNames' `name`.
- `zone` is the graph's: the zone polygon the city is in, as `ZoneLocator` sees it, so Kyrenia is `NX` and Sukhumi `ABKHAZIA` though GeoNames puts them in CY and GE. A city outside every polygon (the West Bank has none in OSM) gets its GeoNames country as alpha-3 (`rules/countries`), and one whose country is no zone is left out and reported.
- The Worker serves the file as a static asset at `/data/cities.json`: `build-cities` writes it into `web/public/data/` (gitignored) for `vite dev` and local builds, like the zone outlines.

## Commands

`pnpm --filter data ring <extract | graph file | URL> --lat <degrees> --lon <degrees> --hours <N> [--closed <alpha-3,…>] [--out <file.geojson>]` is the one-command check of the ticket: it builds the graph of an extract (for example `https://download.geofabrik.de/europe/andorra-latest.osm.pbf`), computes the ring and writes GeoJSON. `build-graph <extract> <out.graph> [--outlines <zones.json>]` writes the graph file, which `ring` also reads, and with `--outlines` the zone outlines, printing their size raw and in brotli. Both print the build report to stderr when they build. pnpm runs both in `data/`; they take a relative path from where pnpm started.

`build-graph … --report <report.md>` also writes the build report as Markdown.

`publish-dataset <dataset directory> [--bucket <name>] [--prefix <prefix>]` puts a dataset in R2 (below); it needs the aws CLI, `CLOUDFLARE_ACCOUNT_ID` and R2's S3 credentials in `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

`fetch-dataset [--bucket <name>]` is the first step of the `roadtrip` Worker's deploy (`worker/README.md`, «Deploy»): `fetchDataset` (`src/fetch-dataset.ts`) reads the pointer, downloads its version's `graph.graph` and `dataset.json` into `engine/dataset/`, `zones.json` and `cities.json` into `web/public/data/`, each next to its place, and moves them in only once every file's size and SHA-256 match the pointer's, so a bad download leaves the files there were. It reads R2 through Cloudflare's API with `CLOUDFLARE_API_TOKEN` (Workers R2 Storage: Read) and `CLOUDFLARE_ACCOUNT_ID`, which Workers Builds gives the deploy.

`build-cities <graph file | extract | URL> <out.json> [--cities <cities1000.zip | .txt | URL>] [--names <alternateNamesV2.zip | .txt | URL>,…] [--countries <alpha-2>,…] [--no-wikidata]` writes the cities file with the zones of the graph's polygons and prints how many cities, names and zones it got, and the size raw and in brotli. By default it downloads GeoNames' `cities1000.zip` and `alternateNamesV2.zip` (205 MB, streamed through `unzip -p`): that is the world build's call with the world graph. `--countries` keeps the cities of those GeoNames countries and takes their own files of alternate names (`alternatenames/<alpha-2>.zip`), for a region: `build-cities georgia.graph ../web/public/data/cities.json --countries GE,AM,AZ,TR` takes 5 s, Wikidata included. `--no-wikidata` skips Wikidata.

`pnpm --filter data valhalla <work dir> [--report <file.md>] [--regions <id,…>] [--mirror <url>]` is the comparison with Valhalla on the full graph (#24; spec «Сверка с Valhalla»), a one-off check that CI does not run. The start points and their regions are in `src/valhalla/places.ts`. It needs osmium-tool, unzip and pyvalhalla's commands on PATH, a few GB of disk per region and ~10 GB of memory while Valhalla builds a region's tiles. Valhalla's results stay in the work directory, so after a change to the speeds a second run only recomputes ours. Its last report is `valhalla-report.md`, with conclusions written by hand; rerun it after a change to the speeds or the contour, and keep the conclusions.

## The world build

`.github/workflows/dataset.yml` builds the world's dataset on the 2nd of each month (spec «Набор данных», #14, #35), or when run by hand (`workflow_dispatch`: the extracts' date, the parts to take, and `parts_run_id`, a run whose filtered parts to build from instead of downloading them again). Its jobs:

1. `plan` picks the date: the newest one every part's page at Geofabrik lists a dated extract of (`europe-261107.osm.pbf`). Geofabrik keeps those of the 1st of each month for months and the others for a week. The dataset's version is that date, `2026-11-07`.
2. `extract`, one job per part of the world (Russia is none: the others cover it), downloads the part of that date, checks its MD5 and that it holds OSM of that date, then keeps with osmium what the builder reads: `tags-filter` of the roads from motorway to tertiary with their links, `barrier=border_control` and `admin_level=2` with their members, and `getid -r` of `SPECIAL_ZONES`.
3. `build` merges the parts (two parts of one date hold one version of an object; the job fails otherwise), runs `add-locations-to-ways --ignore-missing-nodes`, then `build-graph` with `--outlines` and `--report`, and `build-cities` on the graph. The build report goes to the run's summary, the dataset to an artifact kept 14 days.
4. `publish` puts the dataset in R2 with `publish-dataset` (`src/publish.ts`), with the S3 credentials R2 derives from the Cloudflare API token in the repository's secrets: its id, and the SHA-256 of its value. Then it deploys the new dataset: `.github/dataset/deploy.sh` starts the build of the Worker `roadtrip` in Cloudflare Workers Builds on the default branch, with the same token, and waits for the build's outcome, so a failed deploy fails the run (`docs/agents/infrastructure.md`). A trial deploys nothing.

Every heavy step runs under `.github/dataset/measure.sh`, which puts its time, peak memory and the peak disk the job's files take in the summary; `docs/world-build.md` has the numbers of a run.

The dataset in R2, bucket `roadtrip-datasets`:

- `<version>/graph.graph`, `zones.json`, `cities.json`, `dataset.json` (`{ "version": "<version>" }`, as `engine/dataset/dataset.json`) and `report.md` (the build report);
- `<version>/manifest.json`: the version and each file's size and SHA-256;
- `current.json`: the pointer, a copy of the current version's manifest. It moves only once every file of the version is uploaded and its size checked, so a failed run leaves the version before it current. The deploy reads it (`fetch-dataset`, above), then takes the files under its version.

A run of only some of the parts is a trial: it publishes under `trials/<run id>/` and deletes that at the end, so the current dataset stays.

## Tests

The fixtures in `test/fixtures/` are hand-written OSM XML of a few countries and tens of nodes near the equator, where 0.1° is 11.1 km. Each one's header works out the expected values by hand; a new case extends a fixture's header or gets its own fixture.

- `test/ring.test.ts`: the engine's seam (spec «Решения по тестам», seam 1), borders included. Its border tests build their own small tables with `test/rules.ts`; the closed territories and the zones of #13 use the shipped table.
- `test/build-graph.test.ts`: the graph itself, the PBF reader against the XML, the graph file, the build report.
- `test/outlines.test.ts`: the zone outlines against the graph's `ZoneLocator` on `zones.osm`, and the simplification.
- `test/border-table.test.ts` and `test/data-version.test.ts`: the border table's check and the data version, here because every package's tests run under `data`'s vitest and types.
- `test/cities.test.ts`: the cities file from lines in GeoNames' formats, a double of Wikidata and the zones of `zones.osm`; `test/wikidata.test.ts`: the Wikidata client against a double of the Query Service.
- `test/commands.test.ts`: the commands as processes; `build-cities` reads the small GeoNames files in `test/fixtures/geonames/`.
- `test/zone-locator.test.ts`: `ZoneLocator` and the builder's `ZoneCells` on squares of whole degrees.
- `test/publish.test.ts`: `publishDataset` against a double of R2: the pointer moves last, and not at all after a failed upload.
- `test/fetch-dataset.test.ts`: `fetchDataset` against a double of R2: the files of the pointer's version take their places, and none does when one's SHA-256 is not the pointer's or the bucket lacks it.
- `test/valhalla-metrics.test.ts`: the measures of the Valhalla comparison (ring area, the median time to cities, the tolerance); the comparison itself runs in no test.
