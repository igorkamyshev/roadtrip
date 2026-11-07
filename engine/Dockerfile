# syntax=docker/dockerfile:1

# The Container's image: the engine server (server/main.ts) with the engine, the border table and the dataset's
# graph, which it loads at start. Built from the repository's root (`image_build_context` in worker/wrangler.jsonc).
FROM node:22-alpine

WORKDIR /app
# Node 22 runs the TypeScript sources by stripping their types: no npm packages, no build step, and the stack of
# a failure points at the source lines.
COPY rules/package.json rules/
COPY rules/src rules/src/
COPY engine/package.json engine/
COPY engine/src engine/src/
COPY engine/server engine/server/
# The dataset: its version, and the graph built by data (worker/README.md) or, on deploy, the dataset's from R2.
COPY engine/dataset/dataset.json engine/dataset/graph.graph engine/dataset/
# The engine imports `rules` as a package, linked as pnpm links it in the workspace: Node strips the types of a
# file whose real path is outside node_modules only.
RUN mkdir -p engine/node_modules && ln -s ../../rules engine/node_modules/rules

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "engine/server/main.ts"]
