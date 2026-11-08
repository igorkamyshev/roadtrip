# engine

The ring engine (spec «Движок», ADR 0001): `computeRing` in `src/index.ts`, the border rules it applies from the border table in `rules` (`src/borders.ts`), and the graph format it shares with the builder in `data` (`src/graph.ts`).

## Portable

The engine runs in a Container under Node today and may move to a Worker or a browser. Code in `src/` uses ECMAScript, typed arrays and the globals declared in `src/portable-globals.d.ts`. The tsconfig has no Node or DOM types, so `pnpm typecheck` fails on a Node API there. Node-only code (reading the graph file, the Container's HTTP server) goes in its own entry file outside `src/`, with its own tsconfig.

## Engine version

`ENGINE_VERSION` in `src/index.ts` is part of the data version in the ring cache key (spec «Кэш колец»; `dataVersion` there, with the dataset's version and the border table's hash): an old ring stays cached under the old version. Bump it by one in the same change whenever the same input would give another result:

- a speed in `data/src/roads.ts`, or which ways are roads;
- the ×1.2, the 30 km/h off-road, the 50 km snapping limit;
- the contour: cell size, near-road radius, simplification, marching squares;
- how the engine reads the border table (`src/borders.ts`), or the zones the builder makes (`data/src/zones.ts`). A change to the table's rows needs no bump: its hash is in the data version;
- which nodes of the roads the builder keeps in the graph (`data/src/build-graph.ts`), as where it cuts a loop or a chain too long for an edge;
- the result's format;
- `GRAPH_FORMAT_VERSION` in `src/graph.ts`, which itself goes up when the graph file's arrays or their meaning change.

A refactor that keeps every result keeps the version.

## The Container's server and image

`server/` is the engine server the Container runs (spec «Container и очередь»), Node-only with its own tsconfig:

- `main.ts` reads `dataset/dataset.json` (the dataset's version) and starts `compute-thread.ts`, a worker thread that loads `dataset/graph.graph` and the border table and runs `computeRing`, so the server's own thread keeps taking requests during a calculation. It listens on `PORT` only once both are loaded: the port being open is what the Container waits for.
- `engine-server.ts` is the server itself, on web-standard Request and Response (`http.ts` serves it with `node:http`): `POST /ring` with the fields of the cache key, one calculation at a time in order, no timeout, a request for a ring that is queued or running gets its result with `joined`, a failure answers 500 with `{ name, message, stack }`. The Worker's tests run it in-process.
- `src/protocol.ts` (`engine/protocol`) types what the Worker and the server say to each other. The Worker and the Container move to a new version at different times in a rollout, so a change to it says what each side does with the other's old version; a change to the result's format bumps `ENGINE_VERSION`.

`Dockerfile` builds the image from the repository's root: these sources, `rules`, and `dataset/`, run by Node's type stripping without npm packages. `dataset/graph.graph` is not in git (`worker/README.md` says how to build one); `dataset/dataset.json` is, and the Worker bundles the same file, so both name the dataset they were built with.

## Tests

The engine's seam tests are in `data/test/ring.test.ts`, not here: their fixtures are OSM files the builder in `data` turns into graphs, and `data` depends on `engine`, not the other way round. Each fixture's header works out the expected values by hand.

The server's tests are here, through its HTTP interface: `server/engine-server.test.ts` with a double for the calculations, which end when the test says, on a clock it moves; `server/main.test.ts` runs `node server/main.ts` on a small graph file, as the image does.
