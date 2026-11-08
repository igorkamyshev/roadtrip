# Infrastructure: Cloudflare and PostHog

Everything runs on the Owner's Cloudflare account `1d6db711ad880b2455da08a6aeb2a119`, which holds other projects too: always filter by name. The Cloudflare connector calls the API (`cloudflare.request`, with `accountId` defined); an AIP call is cut off after about 30 seconds, so send one slow request per call and poll across calls.

## Deploy: Cloudflare Workers Builds

Nothing is deployed by hand (spec «Набор данных», «Деплой»; #36). Each Worker has its own Workers Builds trigger, «Deploy default branch», connected to `igorkamyshev/roadtrip`: branch `main`, root `/`, empty build command, deploy command `pnpm --filter <package> run deploy`, paths `*`, build cache on. The package's `deploy` script is the whole deploy, so a step the deploy needs goes in that script. A merge to `main` runs both triggers at once, in no fixed order.

| Worker | Tag | Trigger | Deploy script |
| --- | --- | --- | --- |
| `roadtrip-error-tracking` | `44628a3a33c14a7a98ad064976904dda` | `3fd91a31-bd70-49d0-ba5f-54ae3d45fb36` | `wrangler deploy` |
| `roadtrip` | `9cb118bdadc145da87a91743d9d461b9` | `5d0acd69-e1e3-4ad2-ac21-47399686d952` | below |

`roadtrip`'s `deploy` (`worker/package.json`) runs three steps:

1. `pnpm --filter data fetch-dataset` (`data/src/cli/fetch-dataset.ts`): reads the pointer `current.json` in the R2 bucket `roadtrip-datasets` (`data/AGENTS.md`, «The world build»), downloads the files of its version through Cloudflare's API, checks each one's size and SHA-256 against the pointer and only then puts them in place: `graph.graph` and `dataset.json` in `engine/dataset/` for the Container's image, `zones.json` and `cities.json` in `web/public/data/` for the client's static assets. A file that does not match fails the deploy.
2. `pnpm --filter web build`: the client, with its source maps uploaded to PostHog when the build has the key (`web/README.md`, «Source maps»).
3. `wrangler deploy`: builds the Container's image (`engine/Dockerfile`: Node runs the engine's TypeScript sources as they are, nothing minified), pushes it to Cloudflare's registry, uploads the Worker with the client and starts the Container's rollout.

The monthly world build (`.github/workflows/dataset.yml`) starts the same build once it moves the pointer, with the same request as below, and waits for the outcome (`.github/dataset/deploy.sh`, «Deploy the dataset»): a new dataset goes live with `main`'s code. It calls the API with the repository's secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, not the build token. A trial run deploys nothing.

The Builds API takes only a user token, and the secret `CLOUDFLARE_API_TOKEN` is an account-owned one (2026-11-08: it verifies at `/accounts/{account_id}/tokens/verify`, not at `/user/tokens/verify`), so the API answers it «Invalid token» (12006) and the step fails: a new dataset gets published but not deployed until the Owner makes the secret a user token (`worker/README.md`, «What stays with the Owner»). Until then, deploy it by starting the build by hand (below).

The first launch went in this order: `roadtrip-error-tracking`, then `roadtrip`, whose `tail_consumers` names it.

### The build token

Both triggers deploy with the build token «ytc-yt-downloader build token» (`b4cb2337-fa9e-44b7-8af2-b747ce939f4c`), the Owner's user token that ytc's Container Worker and Tail Worker deploy with. Workers Builds gives it to the deploy command as `CLOUDFLARE_API_TOKEN`, with `CLOUDFLARE_ACCOUNT_ID`, and `fetch-dataset` reads R2 with it. Its permissions cannot be read through the connector: what the builds proved is that it uploads Workers, pushes Container images, attaches the custom domain and reads `roadtrip-datasets`. A deploy that fails on a permission (`fetch-dataset` says `R2 answered 403`, wrangler says `Authentication error`) is the Owner's to fix: the token is edited in the dashboard, My Profile → API Tokens. Creating another build token needs a new API token, which is the Owner's too.

### Limits

Workers Builds (Paid plan): 20 minutes a build, 4 vCPU, 8 GB of memory, 20 GB of disk, 6 builds at once on the account. A Container's image may be as big as its instance's disk (12 GB for `standard-2`), and the account holds 50 GB of images, old ones included: `wrangler containers images list` shows them, `wrangler containers images delete <image>:<tag>` frees space (a rollback to a Worker version whose image is gone no longer works).

The first builds, 2026-11-08, dataset `2026-11-07` with its 357 MB graph, are far inside them:

- `roadtrip-error-tracking` (`ef78e946-3663-49b0-9268-03a3c2627de2`): 27 s.
- `roadtrip` (`1ffa4237-4a10-4967-8376-96a8543cddd5`): 85 s running, 2 min with the queue and the environment's start. `pnpm install` 5 s from the build cache; `fetch-dataset` 16 s, the graph 11.7 s of it (~30 MB/s); the client 1 s; the image 27 s; the Worker with its 85 assets 5 s; the image's push 11 s (the graph's layer 8 s; `node:22-alpine`'s layers were in the registry already); the Container application 3 s. The second (`a3d04f24-b078-4a5a-8489-ae97f24e754a`) took 86 s and modified the application in place, a new image on the same `standard-2`.
- The image: 535 MB unpacked, 315 MB compressed, the graph's layer ~253 MB of it (the same image rebuilt locally from the world build's artifact).
- Every deploy pushes the graph's layer again: BuildKit stamps the layer with the build's time, so the same graph never makes the same layer (a fixed mtime on the file does not help), and the images stay in the registry until deleted: about 200 deploys fill the account's 50 GB, which ytc's images share.

The Container on the world graph, the same image in Docker under `standard-2`'s limits (1 vCPU, 6 GiB): the graph loads in 0.23–0.27 s, the port opens 0.7–1.9 s after the process starts, with 384 MiB in use; a warm 12 h ring from Frankfurt took 3.4–4.6 s. Cloudflare's own part of a cold start (placing the instance, up to 27 s right after a stop) is in `docs/container-bench.md`. A cold start in production was not observed yet: without the Owner's `SHERPA_API_KEY` no request gets past the visa rules to the Container.

### Check a deploy

A merge's deploy result is only in Cloudflare, not on GitHub. Through the API:

- `GET /accounts/{account_id}/builds/workers/<tag>/builds?per_page=1`: the Worker's latest build. `status` goes `queued` → `running` → `stopped`, then `build_outcome` is `success` or `fail`.
- `GET /accounts/{account_id}/builds/builds/<build_uuid>/logs`: the log, `result.lines` as `[timestamp in ms, text]`; the error is near the end. `fetch-dataset` prints each file it took with its size and time, and the dataset's version.
- `GET /accounts/{account_id}/builds/builds/<build_uuid>`: one build; `build_trigger_metadata` has the branch and commit.

Then the site itself: `https://roadtrip.kamyshev.me/` (the client), `/data/cities.json` and `/data/zones.json` (the dataset's static files), `/tiles/0/0/0` (the basemap) and `/api/ring?lat=…&lon=…&hours=1&cit=RUS`, which needs the Owner's `SHERPA_API_KEY`: without it every ring is `visa_rules_missing`.

### Run a build again

`POST /accounts/{account_id}/builds/triggers/<trigger_uuid>/builds` with `{ "branch": "main" }`: for a failure outside our code (Docker Hub's rate limit on `node:22-alpine`, `timeout awaiting response headers` while pushing the image to `registry.cloudflare.com`), or to deploy a new dataset by hand. The API also takes another branch of the repository, which deploys that branch to production: the first builds of both Workers ran on the integration branch before `main` had this code. A trigger is in `GET /accounts/{account_id}/builds/workers/<tag>/triggers`.

### A new worker

A trigger points at an existing Worker, so create the Worker first. Through the Cloudflare API:

1. `PUT /accounts/{account_id}/workers/scripts/<name>` with a placeholder module (`export default { fetch() { return new Response() } }`, as multipart form data). Its result holds the Worker's `tag`.
2. `POST /accounts/{account_id}/builds/triggers` with `external_script_id` = that tag, `repo_connection_uuid` `6bdf9023-7ce9-4c78-a568-35a017431662` (`igorkamyshev/roadtrip`, made with `PUT /accounts/{account_id}/builds/repos/connections`), `build_token_uuid` above, and the settings above.
3. Build variables, if it needs any: below.
4. `POST /accounts/{account_id}/builds/triggers/<trigger_uuid>/builds` with `{ "branch": "main" }` to deploy the real code, then read `GET /accounts/{account_id}/builds/builds/<build_uuid>` until `status` is `stopped` and check `build_outcome`.

A Worker that others name (in `tail_consumers`, a service binding) is deployed before them.

### Secrets and vars

- **Build variables** are the trigger's, only for the build: `GET` and `PATCH /accounts/{account_id}/builds/triggers/<trigger_uuid>/environment_variables` with `{ "<NAME>": { "value": "…", "is_secret": false } }`. `roadtrip`'s: `POSTHOG_PROJECT_ID` = `718601`, set through the API, and the secret `POSTHOG_PERSONAL_API_KEY`, which the Owner sets (`worker/README.md`, «Deploy»). Without the key the client's build uploads no source maps and the deploy goes on.
- **A Worker's secret** (`wrangler secret put` or `PUT /accounts/{account_id}/workers/scripts/<name>/secrets`) survives every deploy. It lives only in Cloudflare, so its Worker's README names it: `roadtrip`'s `SHERPA_API_KEY`, which the Owner sets. Never ask for its value or put it in the repository.
- **Public values** go in `vars` in `wrangler.jsonc`: the PostHog project token, the basemap's archive key.
- A var and a secret are both bindings and cannot share a name: before moving a secret into `vars`, delete the secret, then deploy.

## Logs

Of a Worker's runs, PostHog gets only the failures, through the Tail Worker (`error-tracking/README.md`). Every run of a Worker, `ok` ones too, is in Workers Observability: `POST /accounts/{account_id}/workers/observability/telemetry/query`, whose body the connector's API search describes. As in ytc:

- `"view": "invocations"` gives one entry per run, with `$workers.entrypoint`, `eventType`, `outcome`, `wallTimeMs`, `cpuTimeMs`; filter on `$metadata.service` (`roadtrip`, `roadtrip-error-tracking`).
- The Container's output (the engine server's line `engine listening on port 8080: data version …, graph … loaded in … ms`, a failed start) is there as events, not invocations: filter on `$container.appName` with `operation: "exists"`, as ytc does.
- In code you send, return a few fields per entry: a raw entry is hundreds of tokens.

The Container application: `GET /accounts/{account_id}/containers/applications` (name `roadtrip-enginecontainer`), its instances under `…/applications/<id>/instances-v2`.

## PostHog

The project is **718601** (`roadtrip`) in the organization **Roadtrip**, US cloud, behind the proxy `https://r-rt.kamyshev.me`. The connector starts on another organization and project: `switch-project {"projectId": 718601}` first, then pass the `conversation_id` it gives on every later call.

- The browser's events (`start set`, `ring result`, `link opened`, `geolocation failed`) are in `web/README.md`, the Worker's (`ring served`, `sherpa fetched`) in `worker/README.md`, the errors (`$exception` from the Tail Worker, with `worker`, `trigger`, `outcome`, `log_message` and the `logger.error` context) in `error-tracking/README.md`.
- The project token (`phc_…`) only writes events and is public: it is in `vars`. A personal key (`phx_…`) is a secret: the source maps' one is a build secret of the `roadtrip` trigger.
