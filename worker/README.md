# roadtrip

The Worker `roadtrip` on `roadtrip.kamyshev.me` ([spec #20](../docs/specs/20.md) «Устройство», «API кольца», «Кэш колец», «Container и очередь», «Экран» → «Карта»). Only on its own domain: `workers_dev` and preview URLs are off, so the zone's WAF rate limit on `/api/ring` always applies.

## Routes

`src/index.ts` routes by path and builds each route's `deps` from `env` and `ctx`; the handlers take their side effects only from `deps`.

- `GET /api/ring` (`src/ring.ts`): the ring, from the ring cache in KV or calculated in the Container. The query and the answer are typed in `src/api.ts` (`RingQuery`, `RingResponse`, `RingError`), which the client imports as `worker/api`.
- `GET /tiles/{z}/{x}/{y}` (`src/tiles.ts`): the basemap's vector tiles from the world's PMTiles archive in R2.
- The client's static assets, `web/dist` (`"assets"` in `wrangler.jsonc`), with the basemap's fonts and sprites and the dataset's zone outlines for the hatching (`/data/zones.json`) and cities file (`/data/cities.json`, both in `data/AGENTS.md`), are served before the Worker runs, so only paths without a file reach it.

## GET /api/ring

1. The query: `lat`, `lon`, `from` and `to`, the ring's bounds in hours (`isScaleRing` in `src/api.ts`: an hour `N−1`–`N` up to the last day's end, 12·`MAX_DAYS`, or a day `12·(D−1)`–`12·D`, D from 2 to `MAX_DAYS`; #82), `cit` (Sherpa's passports, `SHERPA_PASSPORTS` in `rules`) and `visas` (`SCHENGEN` and every country outside Schengen, `HELD_VISAS`: the codes of `COUNTRIES` outside `SCHENGEN_AREA`) as sorted comma-separated codes. Anything else is 400 with `{ error }`.
2. The visa rules of each citizenship (`src/visa-rules.ts`), from its copy in KV or from Sherpa (below). A citizenship without them ends the request: `{ outcome: "visa_rules_missing", missingCitizenship }`, the first such citizenship.
3. Their reduction (`reduceVisaRules` in `src/access.ts`), a pure function: the entry mode of every country (`COUNTRIES` in `rules`: ISO 3166-1, `RKS`, `NX`) and closed territory, and the closed countries, those closed for everyone included. Besides the citizenships' classes it applies the held visas: a country's own visa opens it, `SCHENGEN` the Schengen area (`SCHENGEN_AREA`), and a row of the visa exemptions' table (`VISA_EXEMPTIONS`, in `deps`) opens its country to a holder of its visa while it acts: up to its `until` by the date in UTC of `deps.now`, and for one of its `citizenships` (`actingExemptions` in `rules`, which the client's counters share). `access` names the visa (`visa`) of every country it opens.
4. The key: `ring:<data version>:<lat>,<lon>:<lower>-<upper>:<SHA-256 of the closed countries>`, with the origin rounded to 0.001° and the ring's two bounds in hours. The data version is the dataset's version (`engine/dataset/dataset.json`), the border table's hash and `ENGINE_VERSION`. Citizenships and visas are not in it: those that close the same countries share their rings.
5. A hit answers with `source: "cache"`. A miss posts the origin, the bounds and the closed countries to the Container (and `hours`, the upper bound, for a ring of one hour: a Container from before the bounds reads only that, `engine/src/protocol.ts`) and answers `calculation`, or `joined` when the engine server joined it to a calculation of the same ring.
6. The ring goes to KV for 40 days in the background, unless the Container calculated with another data version (a rollout), the JSON is over 25 MiB, or the request joined another's calculation, which caches it. Every outcome is cached: `ring`, `empty`, `no_roads`, `no_ring`.
7. The answer adds `access` (the start country, closed by the visa rules but not for everyone, becomes `start`: `withStartCountry`) and `visaRulesLoadedAt`, when the oldest of the citizenships' copies came from Sherpa.

A Container failure answers 502: its 500 `{ name, message, stack }` is rebuilt into an `Error` for `logger.error`, as is anything else it answers (`ContainerError`) or a start that failed. The context holds the browser's PostHog ids from `X-POSTHOG-*` and `hours`, the ring's upper bound, never the origin.

## Analytics

`src/analytics.ts` sends the Worker's events to PostHog ([spec #20](../docs/specs/20.md) «Аналитика и ошибки», «Worker»; decision #18) through `posthog-node`, whose `workerd` build needs no `nodejs_compat`. The handlers capture through `deps.analytics`; `requestAnalytics` at the entry is the client of one request:

- `flushAt: 1`, `flushInterval: 0`, each event a `captureImmediate` in `ctx.waitUntil`, and `shutdown()` once the answer is out. A background refresh from Sherpa's still sends after it.
- `distinct_id` is the browser's `X-POSTHOG-DISTINCT-ID`, else `server`; `$session_id` its `X-POSTHOG-SESSION-ID`. The browser adds both to its requests to the production host (`tracing_headers`, web's `src/analytics/`). Every event has `$process_person_profile: false`.
- Disabled off `roadtrip.kamyshev.me`: `wrangler dev` and any other host send nothing.
- Straight to `https://us.i.posthog.com` with the project token, the var `POSTHOG_API_KEY` (public: it only writes events).

The events, never with the origin:

- `ring served`, for each request to `/api/ring` that reached the Worker, as the spec has it: `source` (`cache`, `calculation`, `joined`; none for `visa_rules_missing`), `outcome` (the engine's, `visa_rules_missing`, or `error`), `hours` (the ring's upper bound: N, or 24 for day 2, which names the slider's cell alone), `duration_ms`, and for a calculation and a joined request the Container's timings `queue_ms`, `traversal_ms`, `contour_ms`, and `cold_start_ms` when it waited for the start.
  - The 502 is `error` with `source: calculation`.
  - A query that is no ring query (400) or a method other than GET (405) is `error` with `duration_ms` alone: it has no bounds, and asked neither the cache nor the Container. Decision #18 has no outcome of its own for it, and `error` is the one of its outcomes that fits; the missing `source` tells it from the 502.
- `sherpa fetched`, for each request to Sherpa (`load` in `src/visa-rules.ts`): `citizenship`, `result` (`ok`, `http_error`, `timeout`, `bad_response`), `status` when Sherpa answered, `duration_ms`, `mode` (`background` refreshed a stale copy, `blocking` was waited for), and `quota_remaining` when Sherpa's answer has `x-ratelimit-remaining` or `ratelimit-remaining` (research/sherpa-api saw neither: the quota is the count of these events an hour).

## Visa rules

`src/sherpa.ts` asks Sherpa's undocumented `POST https://requirements-api.joinsherpa.com/v3/maps` for one passport, with the secret `SHERPA_API_KEY` in `x-api-key` (research/sherpa-api, #11). The whole request has 10 s; the answer must pass the schema (`data.attributes.series[]` of the 7 known groups, each `data[]` of `{ id }`) and list at least 200 countries, or it is `bad_response`.

`src/visa-rules.ts` keeps a copy per citizenship in the KV namespace `roadtrip-visa-rules` (binding `VISA_RULES`): `visa-rules:<alpha-3>` → `{ loadedAt, classes }`, Sherpa's countries by group, with no expiry.

- A copy is fresh for a day. A stale copy is served at once and refreshed through `waitUntil`, by one request of an isolate at a time: the isolate's set `refreshing` (in `deps`) keeps the requests that meet the copy meanwhile from starting refreshes of their own. Without a copy the request waits for Sherpa.
- A failure never overwrites or deletes a copy. It writes `visa-rules-failed:<alpha-3>` for 15 min (KV's TTL), and while that mark is there Sherpa is not asked for that citizenship: a stale copy is served as it is, and without one the answer is `visa_rules_missing`.
- Every failure goes to `logger.error` as a `SherpaError`, with `reason` (the HTTP status, `network`, `timeout` or `bad_response`), `citizenship`, `served` (`stale` or `error`) and `problem`, the detail. Every request to Sherpa, failed or not, is a `sherpa fetched` event (above).

## GET /tiles/{z}/{x}/{y}

The port of Protomaps' PMTiles Worker for Cloudflare (`serverless/cloudflare` in `protomaps/PMTiles`), for one archive and without CORS, since the client is on the same domain:

- The archive is the R2 bucket `roadtrip-basemap` (binding `BASEMAP`) under the key in the var `BASEMAP_ARCHIVE`, now `20261107.pmtiles`, the Protomaps build of 2026-11-07 (basemap 4.15.2, z0–15) that the Owner uploaded (#22). A manual update uploads a new build under a new key and changes the var.
- `pmtiles` reads the archive's header and directories by ranges and keeps them in the isolate; the tile comes back unzipped, `application/x-protobuf`.
- 200 with the tile, 204 where the archive has none (MapLibre draws an empty tile), 404 at a zoom the archive lacks, for a path that is no tile and for x or y outside the zoom's grid; anything but GET is 405.
- Every answer from the archive has `Cache-Control: public, max-age=604800` and goes to the Cache API of the data centre, whose key names the archive: a new key misses the old tiles at once, while browsers may keep the old ones for that week.
- An archive missing from the bucket answers 500, uncached, with `logger.error`: the var names a key the Owner has not uploaded.

## The Container

`EngineContainer` in `src/index.ts`, its image `engine/Dockerfile` (the engine server, `engine/server/main.ts`, with the graph and the border table it loads at start):

- `instance_type: "standard-2"` (1 vCPU, 6 GiB), `max_instances: 1`, `scheduling_policy: "default"`, `sleepAfter` the default 10 min, no internet. standard-2, not the spec's standard-1, by the bench of #25 (`docs/container-bench.md`): a 12 h ring from central Europe took 3.4–24 s on standard-1, over the spec's 3 s, and 2.2–3.5 s on standard-2.
- It starts the Container itself with `instanceGetTimeoutMS` of 30 s and `portReadyTimeoutMS` of 60 s, instead of the library's 8 s and 20 s. With one instance, a start right after the Container stopped waits for Cloudflare to release the old one (up to 27 s in the bench, where 8 s failed), and the server opens its port only once the graph is loaded (0.7–1.6 s after the process's start with Europe's).
- It tells the server how long a request waited for the start (`x-cold-start-ms`), which comes back in the timings.
- Cloudflare marks the `default` scheduling policy deprecated in favour of `durable_object`, which is in beta, has no `max_instances` and does not take the `Container` class. The policy cannot change on a deployed application, so moving means a new class and application.

The dataset's version is in `engine/dataset/dataset.json`: the Worker bundles it, and the image copies it next to the graph, so both say the version of the dataset they were built with. The graph (`engine/dataset/graph.graph`) is not in git. Locally it is the graph of one region, built by `data`; the deploy (below) puts the world's and its version there from R2 before `wrangler deploy`. The world's graph of 2026-11-07 (357 MB) loads in 0.23–0.27 s, and the port opens 0.7–1.9 s after the process starts (Docker under the instance's limits, `docs/agents/infrastructure.md`).

## Run it locally

`wrangler dev` builds the image with Docker and runs the Container. It needs a graph and a Docker daemon. For the basemap alone, see «The basemap locally» below.

```bash
# At the root: the graph of one region, into the image's dataset directory
pnpm --filter data build-graph https://download.geofabrik.de/europe/andorra-latest.osm.pbf engine/dataset/graph.graph

# The client, which the Worker serves as its static assets
pnpm --filter web build

cd worker
pnpm dev   # wrangler dev: builds the image, then http://localhost:8787

curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&from=0&to=1&cit=RUS'   # source: calculation, after the cold start
curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&from=0&to=1&cit=RUS'   # source: cache
```

- KV is local (`.wrangler/state`). The rings stay cached under the version in `dataset.json` (`local`): after building another graph, delete `.wrangler/state` or the next answers come from the cache of the old one.
- Sherpa needs a key: put `SHERPA_API_KEY=<key>` in `worker/.dev.vars` (gitignored). Without one Sherpa refuses the request (production answered 400 before its key was set), every ring is `visa_rules_missing`, and the next try for that citizenship waits 15 min (or delete `.wrangler/state`).
- The Tail Worker shows as «not connected»; errors are only printed.
- The engine server's own line (`engine listening on port 8080: data version …, graph … loaded in … ms`) is in the Container's log: `docker logs <container>`.
- If Docker Hub answers 429 to the pull of `node:22-alpine`, pull it from a mirror and tag it: `docker pull mirror.gcr.io/library/node:22-alpine && docker tag mirror.gcr.io/library/node:22-alpine node:22-alpine`.
- The engine server runs without Docker too: `DATASET_DIR=engine/dataset PORT=8080 node engine/server/main.ts`, then `curl -X POST localhost:8080/ring -d '{"origin":{"lat":42.506,"lon":1.522},"lowerHours":0,"upperHours":1,"closedCountries":[]}'`.

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
pnpm typecheck   # the Worker against `wrangler types` (tsconfig.worker.json), the tests against Node's (tsconfig.test.json)
pnpm cf-typegen  # after changing wrangler.jsonc
```

`tsconfig.json` only references those two programs, so that editors and Oxlint's type-aware rules give each file its own.

The tests never import `src/index.ts`: Node cannot load `cloudflare:workers`. They call `handleRing` (`api` in `test/api.ts`) with doubles for both KV namespaces (`test/memory-kv.ts`) and the timers of `deps.sleep` (Sherpa's timeout, `test/timers.ts`) on one clock, a faked `fetch` for Sherpa (`SherpaDouble`, `sherpaMap` in Sherpa's shape, `test/sherpa-double.ts`), the Container and PostHog (`analyticsDouble`, which records the events, `test/analytics-double.ts`), and the engine server in-process on `data`'s fixture graphs: `src/ring.test.ts` covers the ring, its cache and `ring served`, `src/visa-rules.test.ts` the visa rules and `sherpa fetched`, `src/analytics.test.ts` the PostHog client of a request with PostHog's capture API doubled under `posthog-node`, `src/held-visas.test.ts` the held visas with exemption rows of its own (so the table's monthly edits never touch it), and `src/visa-exemptions.test.ts` the shipped table's check. And the tiles route with an R2 double holding a small archive that `test/pmtiles-archive.ts` writes, and a Cache API double.

## Deploy

Cloudflare Workers Builds deploys this Worker on every push to `main` (trigger «Deploy default branch», deploy command `pnpm --filter worker run deploy`), and the monthly world build starts the same build once a new dataset is current. How to check, rerun or change a build: `docs/agents/infrastructure.md`. The `deploy` script is the whole deploy:

1. `pnpm --filter data fetch-dataset`: the dataset `current.json` points at in the R2 bucket `roadtrip-datasets` (`data/AGENTS.md`), each file checked by its size and SHA-256 before it takes its place, so a file that does not match fails the deploy: the graph and `dataset.json` in `engine/dataset/`, the zone outlines and the cities file in `web/public/data/`. It needs `CLOUDFLARE_API_TOKEN` with Workers R2 Storage: Read and `CLOUDFLARE_ACCOUNT_ID`, which Workers Builds gives it. Run by hand, it overwrites the committed `engine/dataset/dataset.json` (`local`): put that back before a commit.
2. `pnpm --filter data russian-names`: the table of Russian names `data/russian-names.tsv` over the names of `web/public/data/cities.json` (`data/AGENTS.md`, «Cities file»), so an edit of the table goes live with the next deploy, with no new dataset. A bad table (a line not of three columns, a repeated id, a name not in Russian letters) fails the deploy, naming its line, and leaves the file untouched; it fails the world build's `build-cities` too.
3. `pnpm --filter web build`: the client, its source maps uploaded to PostHog when the build has the key (below; `web/README.md`, «Source maps»).
4. `wrangler deploy`: builds the Container's image with the graph (`engine/Dockerfile`: Node runs the engine's TypeScript sources as they are, nothing minified; 535 MB, 315 MB compressed with the dataset of 2026-11-07), pushes it to Cloudflare's registry, uploads the Worker with the client, then starts the Container's rollout.

`roadtrip-error-tracking` went first on the first launch: this Worker names it in `tail_consumers`. The archive named by `BASEMAP_ARCHIVE` must be in `roadtrip-basemap` before a deploy that changes it, or every tile answers 500.

### What stays with the Owner

The agent never sees these secrets. All were set on 2026-11-08; this says where each lives, should the Owner replace one:

- **The build secret `POSTHOG_PERSONAL_API_KEY`**: the Owner's personal PostHog key (`phx_…`) with the scope «error tracking: write», for the client's source maps (`web/README.md`, «Source maps»). It is on this Worker's trigger as a secret: Workers & Pages → roadtrip → Settings → Build → Variables and secrets, or `PATCH /accounts/{account_id}/builds/triggers/5d0acd69-e1e3-4ad2-ac21-47399686d952/environment_variables` with `{ "POSTHOG_PERSONAL_API_KEY": { "value": "phx_…", "is_secret": true } }`, beside `POSTHOG_PROJECT_ID` (`718601`). Without it the builds succeed and upload no source maps.
- **The Worker's secret `SHERPA_API_KEY`**: `wrangler secret put SHERPA_API_KEY` in `worker/`, or Workers & Pages → roadtrip → Settings → Variables and Secrets, as a secret. It survives every deploy. Without it every ring answers `visa_rules_missing` and each request logs a `SherpaError`. A citizenship whose load failed in the 15 min before a new key keeps answering `visa_rules_missing` until its mark expires: to clear it at once, delete the keys `visa-rules-failed:*` in the KV namespace `VISA_RULES` (`DELETE /accounts/{account_id}/storage/kv/namespaces/<id>/values/<key>`). Its type is declared by hand in `src/env.d.ts`, since `wrangler types` does not see secrets.
- **The repository's secret `CLOUDFLARE_API_TOKEN`**, for the world build's publish and deploy: a user token (My Profile → API Tokens) with Workers R2 Storage: Edit and Workers Builds Configuration (listed as «Workers CI»): Edit. Cloudflare's Builds API answers an account-owned token «Invalid token», so the step «Deploy the dataset» of `.github/workflows/dataset.yml` fails while the publish goes through (`docs/agents/infrastructure.md`). A new dataset is then deployed by starting this Worker's build by hand («Run a build again» there).
- **The build's access to `roadtrip-datasets`**: the build token, «ytc-yt-downloader build token», the Owner's user token that ytc's Workers deploy with too, reads it already: the first build took the dataset with it. Should a build stop at `R2 answered 403` (say, after the token's permissions change), the Owner gives that token Workers R2 Storage: Read (My Profile → API Tokens).

## The prototype stand

A second Worker, `roadtrip-stand`, at `https://roadtrip-stand.kamyshev.workers.dev` (#100): the client of a prototype's branch, shown with production's data so the Owner can try it on their desktop. It is not this Worker: its code and config are `stand/index.ts` and `stand/wrangler.jsonc`, and `wrangler.jsonc` above stays as it is.

- It serves the branch's `web/dist` as its static assets. Every path without a file reaches its Worker, which asks `https://roadtrip.kamyshev.me` for the same path: `/api/ring`, `/tiles/…`, and `/data/…`, which the stand's build does not have (no `fetch-dataset`). The rings, the basemap, the zone outlines and the cities file are production's.
- It asks production by its public address, so the zone's WAF rate limit on `/api/ring` applies. Production sees every request from the stand as one client, Cloudflare's address `2a06:98c0:3600::103`: the stand's visitors share one limit of 20 requests in 10 s (`docs/agents/infrastructure.md`, «Rate limit»). A sweep of the whole slider is up to 16 rings (`SLIDER_CELLS`).
- The browser sends no events of its own off `PRODUCTION_HOST`, nor the `X-POSTHOG-*` ids. The rings it asks for are still `ring served` events of this Worker, with `distinct_id` `server`: trying a prototype adds to production's ring counts.
- One branch at a time: the last one deployed is the one it shows. A session that deploys its prototype replaces whatever another session had there. Which one that is: the latest build of the stand's Worker (`docs/agents/infrastructure.md`, «Check a deploy», with its tag), `build_trigger_metadata.branch`.

### Deploy a branch

Nothing is deployed by hand here either: Workers Builds builds the branch from GitHub with the build token, as it does `main`. Never start `roadtrip`'s trigger with a prototype's branch: that puts it on production. The stand's trigger, «Deploy on request», runs `pnpm --filter worker run deploy:stand` (the client's build, then `wrangler deploy` of `stand/`). It starts on no push (its branch is `stand-deploys-only-on-request`, which nobody pushes), only on this one call, with the branch pushed to GitHub:

```js
async () => {
	const { result } = await cloudflare.request({
		method: 'POST',
		path: `/accounts/${accountId}/builds/triggers/4dfad845-37e3-45bf-880a-5e5c48b80c24/builds`,
		body: { branch: '<the prototype branch>' },
	});
	return result.build_uuid;
};
```

The branch must have `stand/` (every branch from `main` since #100). The build takes under a minute (the first, 2026-11-10: 43 s); follow it as in «Check a deploy». A deploy turns the address on (`workers_dev: true`).

### Keep it on, or switch it off

The stand stays on after the Owner has chosen a prototype, so the next prototypes deploy onto it (#98). Switch the address off only when the Owner asks for it: `POST /accounts/{account_id}/workers/scripts/roadtrip-stand/subdomain` with `{ "enabled": false }`. The Worker and its trigger stay, and the next deploy turns the address on again.

To remove the stand for good: `DELETE /accounts/{account_id}/builds/triggers/4dfad845-37e3-45bf-880a-5e5c48b80c24`, then `DELETE /accounts/{account_id}/workers/scripts/roadtrip-stand`; in the repository `stand/`, the `deploy:stand` script, `stand/**/*.ts` and the stand in the comment of `tsconfig.worker.json`, this section, the stand's row and paragraph in `docs/agents/infrastructure.md` (and «All three triggers» there back to «Both»), and the stand in the `worker` line of the root `AGENTS.md`.
