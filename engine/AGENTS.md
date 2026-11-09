# engine

The ring engine ([spec #20](../docs/specs/20.md) «Движок», ADR 0001): `computeRing` in `src/index.ts`, where the origin meets its road (`src/start.ts`, `src/snap.ts`, which the Valhalla comparison in `data` shares), the border rules it applies from the border table in `rules` (`src/borders.ts`; land in no country's polygon, as the West Bank, counts at a border as the zone most of its roads lead to: `borderZones`), and the graph format it shares with the builder in `data` (`src/graph.ts`).

## Portable

The engine runs in a Container under Node today and may move to a Worker or a browser. Code in `src/` uses ECMAScript, typed arrays and the globals declared in `src/portable-globals.d.ts`. The tsconfig has no Node or DOM types, so `pnpm typecheck` fails on a Node API there. Node-only code (reading the graph file, the Container's HTTP server) goes in its own entry file outside `src/`, with its own tsconfig.

## Engine version

`ENGINE_VERSION` in `src/version.ts` is part of the data version in the ring cache key ([spec #20](../docs/specs/20.md) «Кэш колец»; `dataVersion` in `src/index.ts`, with the dataset's version and the border table's hash): an old ring stays cached under the old version. Bump it by one in the same change whenever the same input would give another result. A change to the border table's rows needs no bump: its hash is in the data version.

The sources such a change can be in, the engine's and the graph builder's, are `ENGINE_SOURCES` beside it, with what each holds, and their hash is `ENGINE_FINGERPRINT`. A change to any of them fails `data/test/engine-fingerprint.test.ts`: bump the version if any ring can come out otherwise, and record the fingerprint either way, with `pnpm --filter data engine-fingerprint`. A new fingerprint with the same version says every ring stays as it was, as after a refactor. A new file the answer depends on joins `ENGINE_SOURCES`.

`data/test/data-version.test.ts` spells the data version out, the engine's version with it, so a bump changes it there too.

## The Container's server and image

`server/` is the engine server the Container runs ([spec #20](../docs/specs/20.md) «Container и очередь»), Node-only with its own tsconfig:

- `main.ts` reads `dataset/dataset.json` (the dataset's version) and starts `compute-thread.ts`, a worker thread that loads `dataset/graph.graph` and the border table and runs `computeRing`, so the server's own thread keeps taking requests during a calculation. It listens on `PORT` only once both are loaded: the port being open is what the Container waits for.
- `engine-server.ts` is the server itself, on web-standard Request and Response (`http.ts` serves it with `node:http`): `POST /ring` with the fields of the cache key, one calculation at a time in order, no timeout, a request for a ring that is queued or running gets its result with `joined`, a failure answers 500 with `{ name, message, stack }`. The Worker's tests run it in-process.
- `src/protocol.ts` (`engine/protocol`) types what the Worker and the server say to each other. The Worker and the Container move to a new version at different times in a rollout, so a change to it says what each side does with the other's old version; a change to the result's format bumps `ENGINE_VERSION`.

`Dockerfile` builds the image from the repository's root: these sources, `rules`, and `dataset/`, run by Node's type stripping without npm packages. `dataset/graph.graph` is not in git (`worker/README.md` says how to build one); `dataset/dataset.json` is, as `local`, and the Worker bundles the same file, so both name the dataset they were built with. The deploy puts the current dataset's graph and `dataset.json` there from R2 before it builds the image (`worker/README.md`, «Deploy»). Nothing in the image is minified or bundled: a failure's stack points at the source lines. CI builds the image on the graph of a fixture (`data/test/fixtures/straight-road.osm`), starts it and asks it a ring, so an image that would not build or start fails there, not in the deploy.

## Tests

The engine's seam tests are in `data/test/ring.test.ts`, not here: their fixtures are OSM files the builder in `data` turns into graphs, and `data` depends on `engine`, not the other way round. Each fixture's header works out the expected values by hand.

The server's tests are here, through its HTTP interface: `server/engine-server.test.ts` with a double for the calculations, which end when the test says, on a clock it moves; `server/main.test.ts` runs `node server/main.ts` on a small graph file, as the image does.
