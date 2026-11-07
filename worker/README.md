# roadtrip

The Worker `roadtrip` on `roadtrip.kamyshev.me` (spec «Устройство», «API кольца», «Кэш колец», «Container и очередь», «Экран» → «Карта»). Only on its own domain: `workers_dev` and preview URLs are off, so the zone's WAF rate limit on `/api/ring` always applies.

## Routes

`src/index.ts` routes by path and builds each route's `deps` from `env` and `ctx`; the handlers take their side effects only from `deps`.

- `GET /api/ring` (`src/ring.ts`): the ring, from the ring cache in KV or calculated in the Container. The query and the answer are typed in `src/api.ts` (`RingQuery`, `RingResponse`, `RingError`), which the client imports as `worker/api`.
- `GET /tiles/{z}/{x}/{y}` (`src/tiles.ts`): the basemap's vector tiles from the world's PMTiles archive in R2.
- The client's static assets, `web/dist` (`"assets"` in `wrangler.jsonc`), with the basemap's fonts and sprites and the dataset's zone outlines for the hatching (`/data/zones.json`, `data/AGENTS.md`), are served before the Worker runs, so only paths without a file reach it.

## GET /api/ring

1. The query: `lat`, `lon`, `hours` (1–12), `cit` (Sherpa's passports, `SHERPA_PASSPORTS` in `rules`) and `visas` (`SCHENGEN` and the countries of those passports outside Schengen, `HELD_VISAS`) as sorted comma-separated codes. Anything else is 400 with `{ error }`.
2. The visa rules of each citizenship (`src/visa-rules.ts`), from its copy in KV or from Sherpa (below). A citizenship without them ends the request: `{ outcome: "visa_rules_missing", missingCitizenship }`, the first such citizenship.
3. Their reduction (`reduceVisaRules` in `src/access.ts`), a pure function: the entry mode of every country (`COUNTRIES` in `rules`: ISO 3166-1, `RKS`, `NX`) and closed territory, and the closed countries, those closed for everyone included. Besides the citizenships' classes it applies the held visas: a country's own visa opens it, `SCHENGEN` the Schengen area (`SCHENGEN_AREA`), and a row of the visa exemptions' table (`VISA_EXEMPTIONS`, in `deps`) opens its country to a holder of its visa while it acts: up to its `until` by the date in UTC of `deps.now`, and for one of its `citizenships` (`actingExemptions` in `rules`, which the client's counters share). `access` names the visa (`visa`) of every country it opens.
4. The key: `ring:<data version>:<lat>,<lon>:<N>:<SHA-256 of the closed countries>`, with the origin rounded to 0.001°. The data version is the dataset's version (`engine/dataset/dataset.json`), the border table's hash and `ENGINE_VERSION`. Citizenships and visas are not in it: those that close the same countries share their rings.
5. A hit answers with `source: "cache"`. A miss posts the origin, N and the closed countries to the Container and answers `calculation`, or `joined` when the engine server joined it to a calculation of the same ring.
6. The ring goes to KV for 40 days in the background, unless the Container calculated with another data version (a rollout), the JSON is over 25 MiB, or the request joined another's calculation, which caches it. Every outcome is cached: `ring`, `empty`, `no_roads`, `no_ring`.
7. The answer adds `access` (the start country, closed by the visa rules but not for everyone, becomes `start`: `withStartCountry`) and `visaRulesLoadedAt`, when the oldest of the citizenships' copies came from Sherpa.

A Container failure answers 502: its 500 `{ name, message, stack }` is rebuilt into an `Error` for `logger.error`, as is anything else it answers (`ContainerError`) or a start that failed. The context holds the browser's PostHog ids from `X-POSTHOG-*` and N, never the origin.

## Visa rules

`src/sherpa.ts` asks Sherpa's undocumented `POST https://requirements-api.joinsherpa.com/v3/maps` for one passport, with the secret `SHERPA_API_KEY` in `x-api-key` (research/sherpa-api, #11). The whole request has 10 s; the answer must pass the schema (`data.attributes.series[]` of the 7 known groups, each `data[]` of `{ id }`) and list at least 200 countries, or it is `bad_response`.

`src/visa-rules.ts` keeps a copy per citizenship in the KV namespace `roadtrip-visa-rules` (binding `VISA_RULES`): `visa-rules:<alpha-3>` → `{ loadedAt, classes }`, Sherpa's countries by group, with no expiry.

- A copy is fresh for a day. A stale copy is served at once and refreshed through `waitUntil`; without a copy the request waits for Sherpa.
- A failure never overwrites or deletes a copy. It writes `visa-rules-failed:<alpha-3>` for 15 min (KV's TTL), and while that mark is there Sherpa is not asked for that citizenship: a stale copy is served as it is, and without one the answer is `visa_rules_missing`.
- Every failure goes to `logger.error` as a `SherpaError`, with `reason` (the HTTP status, `network`, `timeout` or `bad_response`), `citizenship`, `served` (`stale` or `error`) and `problem`, the detail. `load` in `src/visa-rules.ts` marks where #34's `sherpa fetched` goes.

## GET /tiles/{z}/{x}/{y}

The port of Protomaps' PMTiles Worker for Cloudflare (`serverless/cloudflare` in `protomaps/PMTiles`), for one archive and without CORS, since the client is on the same domain:

- The archive is the R2 bucket `roadtrip-basemap` (binding `BASEMAP`) under the key in the var `BASEMAP_ARCHIVE`, now `20261107.pmtiles`, the Protomaps build of 2026-11-07 (basemap 4.15.2, z0–15) that the Owner uploaded (#22). A manual update uploads a new build under a new key and changes the var.
- `pmtiles` reads the archive's header and directories by ranges and keeps them in the isolate; the tile comes back unzipped, `application/x-protobuf`.
- 200 with the tile, 204 where the archive has none (MapLibre draws an empty tile), 404 at a zoom the archive lacks, for a path that is no tile and for x or y outside the zoom's grid; anything but GET is 405.
- Every answer from the archive has `Cache-Control: public, max-age=604800` and goes to the Cache API of the data centre, whose key names the archive: a new key misses the old tiles at once, while browsers may keep the old ones for that week.
- An archive missing from the bucket answers 500, uncached, with `logger.error`: the var names a key the Owner has not uploaded.

## The Container

`EngineContainer` in `src/index.ts`, its image `engine/Dockerfile` (the engine server, `engine/server/main.ts`, with the graph and the border table it loads at start):

- `instance_type: "standard-1"`, `max_instances: 1`, `scheduling_policy: "default"`, `sleepAfter` the default 10 min, no internet.
- It starts the Container itself with `portReadyTimeoutMS` of 120 s, instead of the library's 20 s, because the server opens its port only once the graph is loaded. 120 s is a placeholder: #25 measures the cold start with the world's graph and sets it.
- It tells the server how long a request waited for the start (`x-cold-start-ms`), which comes back in the timings.
- Cloudflare marks the `default` scheduling policy deprecated in favour of `durable_object`, which is in beta, has no `max_instances` and does not take the `Container` class. The policy cannot change on a deployed application, so moving means a new class and application.

The dataset's version is in `engine/dataset/dataset.json`: the Worker bundles it, and the image copies it next to the graph, so both say the version of the dataset they were built with. The graph (`engine/dataset/graph.graph`) is not in git. For now it is the graph of one region, built by `data`; the deploy (#36) takes the dataset's graph and version from R2 into `engine/dataset/` before `wrangler deploy`.

## Run it locally

`wrangler dev` builds the image with Docker and runs the Container. It needs a graph and a Docker daemon. For the basemap alone, see «The basemap locally» below.

```bash
# At the root: the graph of one region, into the image's dataset directory
pnpm --filter data build-graph https://download.geofabrik.de/europe/andorra-latest.osm.pbf engine/dataset/graph.graph

# The client, which the Worker serves as its static assets
pnpm --filter web build

cd worker
pnpm dev   # wrangler dev: builds the image, then http://localhost:8787

curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&hours=1&cit=RUS'   # source: calculation, after the cold start
curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&hours=1&cit=RUS'   # source: cache
```

- KV is local (`.wrangler/state`). The rings stay cached under the version in `dataset.json` (`local`): after building another graph, delete `.wrangler/state` or the next answers come from the cache of the old one.
- Sherpa needs a key: put `SHERPA_API_KEY=<key>` in `worker/.dev.vars` (gitignored). Without one Sherpa answers 401, every ring is `visa_rules_missing`, and the next try for that citizenship waits 15 min (or delete `.wrangler/state`).
- The Tail Worker shows as «not connected»; errors are only printed.
- The engine server's own line (`engine listening on port 8080: data version …, graph … loaded in … ms`) is in the Container's log: `docker logs <container>`.
- If Docker Hub answers 429 to the pull of `node:22-alpine`, pull it from a mirror and tag it: `docker pull mirror.gcr.io/library/node:22-alpine && docker tag mirror.gcr.io/library/node:22-alpine node:22-alpine`.
- The engine server runs without Docker too: `DATASET_DIR=engine/dataset PORT=8080 node engine/server/main.ts`, then `curl -X POST localhost:8080/ring -d '{"origin":{"lat":42.506,"lon":1.522},"hours":1,"closedCountries":[]}'`.

### The basemap locally

The tiles come from the local R2 of `wrangler dev` (`.wrangler/state`), which holds a region cut out of the world's build with the `pmtiles` CLI (`go-pmtiles`: a release binary, or `go install github.com/protomaps/go-pmtiles@latest`). Montenegro at every zoom is 113 MB; `wrangler r2 object put` takes files up to 300 MiB.

```bash
# The region, read by ranges from the build: no need to download the world
go-pmtiles extract https://build.protomaps.com/20261107.pmtiles /tmp/mne.pmtiles --bbox=18.43,41.85,20.36,43.56

pnpm --filter web build      # the client with the fonts and sprites

cd worker
pnpm exec wrangler r2 object put roadtrip-basemap/20261107.pmtiles --file=/tmp/mne.pmtiles --local
pnpm exec wrangler dev --enable-containers=false   # no Docker; /api/ring answers 502

curl -sI http://localhost:8787/tiles/10/566/378    # Podgorica: 200, application/x-protobuf, max-age=604800
```

Open `http://localhost:8787/#/?p=42.44100,19.26300&h=3`: the labels are Russian where OSM has `name:ru` (Черногория, Подгорица, Будва), local where it has none (Velje Brdo, Piperi). Delete the extract and `.wrangler/state` afterwards. The asset server redirects `light@2x.json` to `light%402x.json` (307), which MapLibre follows.

## Checks

```bash
pnpm test        # at the root; this package's tests are src/*.test.ts
pnpm typecheck   # the Worker against `wrangler types`, the tests against Node's
pnpm cf-typegen  # after changing wrangler.jsonc
```

The tests never import `src/index.ts`: Node cannot load `cloudflare:workers`. They call `handleRing` (`test/api.ts`) with doubles for both KV namespaces on one clock, a faked `fetch` for Sherpa (`SherpaDouble`, `sherpaMap` in Sherpa's shape) and the Container, and the engine server in-process on `data`'s fixture graphs: `src/ring.test.ts` covers the ring and its cache, `src/visa-rules.test.ts` the visa rules, `src/held-visas.test.ts` the held visas with exemption rows of its own (so the table's monthly edits never touch it), and `src/visa-exemptions.test.ts` the shipped table's check. And the tiles route with an R2 double holding a small archive that `test/pmtiles-archive.ts` writes, and a Cache API double.

## Deploy

Not yet: the deploy through Workers Builds and its `deploy` script come with #36. Deploy `roadtrip-error-tracking` before this Worker, which names it in `tail_consumers`. The archive named by `BASEMAP_ARCHIVE` must be in `roadtrip-basemap` before the deploy, or every tile answers 500. The Owner sets the secret `SHERPA_API_KEY` (`wrangler secret put SHERPA_API_KEY`); its type is declared by hand in `src/env.d.ts`, since `wrangler types` does not see secrets.
