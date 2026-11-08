# roadtrip

`CLAUDE.md` is a symlink to this file, so edit `AGENTS.md` only. Any new `AGENTS.md` in a subfolder gets its own `CLAUDE.md` symlink, which the pre-commit hook creates (`node scripts/agents-symlinks.ts`) and CI checks, and a line under «Packages», which the pre-commit hook and `pnpm lint` check (`lint/agents-pointers.ts`).

## Packages

Read a package's `AGENTS.md` before working in it:

- `engine/AGENTS.md`: the ring engine, keeping it portable, when to bump the engine version, where its tests live; the engine server of the Container and its image.
- `data/AGENTS.md`: the graph builder, the zone outlines, the cities file, the `ring` and `build-cities` commands, the fixtures; the monthly world build (`.github/workflows/dataset.yml`) and the dataset in R2 with its pointer `current.json`.

`rules` holds the tables edited by hand: the border table, the visa exemptions' table (`VISA_EXEMPTIONS`), the Schengen area, the countries as zones (`COUNTRIES`), Sherpa's 199 passports (`SHERPA_PASSPORTS`) and the EU (`EU`, for the line on Russian plates); it has no `AGENTS.md` yet.

`error-tracking` is the Tail Worker that turns the Workers' errors into PostHog `$exception` events, and the home of the logger they write with (`import { logger } from 'error-tracking/logger'`). Its `README.md` says how a Worker attaches it and writes `logger.error`.

`worker` is the Worker `roadtrip`: `GET /api/ring` from the ring cache in KV or the Container with the engine, the visa rules from Sherpa with their copies in KV and their reduction, the `EngineContainer` class and the wrangler config. Its `README.md` says how a request goes, how the visa rules are loaded and kept, where the routes and `deps` are built, and how to run it locally with the Container.

`web` is the client, the one screen, built into the Worker's static assets. Its `README.md` says where the state, the ring requests, the map's layers and the phrase's slots are, and how the screen tests run (`pnpm e2e`, Playwright).

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `igorkamyshev/roadtrip`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Visa exemptions review

Reviewing or editing the visa exemptions' table or the Schengen area, the monthly run included: `docs/agents/visa-exemptions-review.md`.
