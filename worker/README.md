# roadtrip

The Worker `roadtrip` on `roadtrip.kamyshev.me` (spec «Устройство», «API кольца», «Кэш колец», «Container и очередь»). Only on its own domain: `workers_dev` and preview URLs are off, so the zone's WAF rate limit on `/api/ring` always applies.

## Routes

`src/index.ts` routes by path and builds each route's `deps` from `env` and `ctx`; the handlers take their side effects only from `deps`.

- `GET /api/ring` (`src/ring.ts`): the ring, from the ring cache in KV or calculated in the Container. The query and the answer are typed in `src/api.ts` (`RingQuery`, `RingResponse`, `RingError`), which the client imports as `worker/api`.
- The client's static assets, `web/dist` (`"assets"` in `wrangler.jsonc`), are served before the Worker runs, so only paths without a file reach it; the tiles (#29) come as another route.

## GET /api/ring

1. The query: `lat`, `lon`, `hours` (1–12), `cit` and `visas` as sorted comma-separated codes. Anything else is 400 with `{ error }`.
2. The closed countries (`src/closed-countries.ts`): until the visa rules (#30), the countries the border table closes for everyone, whatever the citizenships and visas.
3. The key: `ring:<data version>:<lat>,<lon>:<N>:<SHA-256 of the closed countries>`, with the origin rounded to 0.001°. The data version is the dataset's version (`engine/dataset/dataset.json`), the border table's hash and `ENGINE_VERSION`.
4. A hit answers with `source: "cache"`. A miss posts the origin, N and the closed countries to the Container and answers `calculation`, or `joined` when the engine server joined it to a calculation of the same ring.
5. The ring goes to KV for 40 days in the background, unless the Container calculated with another data version (a rollout), the JSON is over 25 MiB, or the request joined another's calculation, which caches it. Every outcome is cached: `ring`, `empty`, `no_roads`, `no_ring`.

A Container failure answers 502: its 500 `{ name, message, stack }` is rebuilt into an `Error` for `logger.error`, as is anything else it answers (`ContainerError`) or a start that failed. The context holds the browser's PostHog ids from `X-POSTHOG-*` and N, never the origin.

## The Container

`EngineContainer` in `src/index.ts`, its image `engine/Dockerfile` (the engine server, `engine/server/main.ts`, with the graph and the border table it loads at start):

- `instance_type: "standard-1"`, `max_instances: 1`, `scheduling_policy: "default"`, `sleepAfter` the default 10 min, no internet.
- It starts the Container itself with `portReadyTimeoutMS` of 120 s, instead of the library's 20 s, because the server opens its port only once the graph is loaded. 120 s is a placeholder: #25 measures the cold start with the world's graph and sets it.
- It tells the server how long a request waited for the start (`x-cold-start-ms`), which comes back in the timings.
- Cloudflare marks the `default` scheduling policy deprecated in favour of `durable_object`, which is in beta, has no `max_instances` and does not take the `Container` class. The policy cannot change on a deployed application, so moving means a new class and application.

The dataset's version is in `engine/dataset/dataset.json`: the Worker bundles it, and the image copies it next to the graph, so both say the version of the dataset they were built with. The graph (`engine/dataset/graph.graph`) is not in git. For now it is the graph of one region, built by `data`; the deploy (#36) takes the dataset's graph and version from R2 into `engine/dataset/` before `wrangler deploy`.

## Run it locally

`wrangler dev` builds the image with Docker and runs the Container. It needs a graph and a Docker daemon.

```bash
# At the root: the graph of one region, into the image's dataset directory
pnpm --filter data build-graph https://download.geofabrik.de/europe/andorra-latest.osm.pbf engine/dataset/graph.graph

# The client, which the Worker serves as its static assets
pnpm --filter web build

cd worker
pnpm dev   # wrangler dev: builds the image, then http://localhost:8787

curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&hours=1&cit=RUS'   # source: calculation, after the cold start
curl 'http://localhost:8787/api/ring?lat=42.5063&lon=1.5218&hours=1&cit=TUR'   # source: cache
```

- KV is local (`.wrangler/state`). The rings stay cached under the version in `dataset.json` (`local`): after building another graph, delete `.wrangler/state` or the next answers come from the cache of the old one.
- The Tail Worker shows as «not connected»; errors are only printed.
- The engine server's own line (`engine listening on port 8080: data version …, graph … loaded in … ms`) is in the Container's log: `docker logs <container>`.
- If Docker Hub answers 429 to the pull of `node:22-alpine`, pull it from a mirror and tag it: `docker pull mirror.gcr.io/library/node:22-alpine && docker tag mirror.gcr.io/library/node:22-alpine node:22-alpine`.
- The engine server runs without Docker too: `DATASET_DIR=engine/dataset PORT=8080 node engine/server/main.ts`, then `curl -X POST localhost:8080/ring -d '{"origin":{"lat":42.506,"lon":1.522},"hours":1,"closedCountries":[]}'`.

## Checks

```bash
pnpm test        # at the root; this package's tests are src/*.test.ts
pnpm typecheck   # the Worker against `wrangler types`, the tests against Node's
pnpm cf-typegen  # after changing wrangler.jsonc
```

The tests never import `src/index.ts`: Node cannot load `cloudflare:workers`. They call `handleRing` with doubles for KV and the Container, and the engine server in-process on `data`'s fixture graphs.

## Deploy

Not yet: the deploy through Workers Builds and its `deploy` script come with #36. Deploy `roadtrip-error-tracking` before this Worker, which names it in `tail_consumers`.
