# roadtrip

`CLAUDE.md` is a symlink to this file, so edit `AGENTS.md` only. Any new `AGENTS.md` in a subfolder gets its own `CLAUDE.md` symlink, which the pre-commit hook creates (`node scripts/agents-symlinks.ts`) and CI checks, and a line under «Packages», which the pre-commit hook and `pnpm lint` check (`lint/agents-pointers.ts`).

## Packages

Read a package's `AGENTS.md` before working in it:

- `engine/AGENTS.md`: the ring engine, keeping it portable, when to bump the engine version, where its tests live; the engine server of the Container and its image.
- `data/AGENTS.md`: the graph builder, the zone outlines, the cities file, the `ring` and `build-cities` commands, the fixtures; the monthly world build (`.github/workflows/dataset.yml`) and the dataset in R2 with its pointer `current.json`.

`rules` holds the tables edited by hand: the border table, the visa exemptions' table (`VISA_EXEMPTIONS`), the Schengen area, the countries as zones (`COUNTRIES`), Sherpa's 199 passports (`SHERPA_PASSPORTS`) and the EU (`EU`, for the line on Russian plates); it has no `AGENTS.md` yet.

`error-tracking` is the Tail Worker that turns the Workers' errors into PostHog `$exception` events, and the home of the logger they write with (`import { logger } from 'error-tracking/logger'`). Its `README.md` says how a Worker attaches it and writes `logger.error`.

`worker` is the Worker `roadtrip`: `GET /api/ring` from the ring cache in KV or the Container with the engine, the visa rules from Sherpa with their copies in KV and their reduction, the Worker's events in PostHog (`ring served`, `sherpa fetched`), the `EngineContainer` class and the wrangler config. Its `README.md` says how a request goes, how the visa rules are loaded and kept, what the events say, where the routes and `deps` are built, and how to run it locally with the Container.

`web` is the client, the one screen, built into the Worker's static assets. Its `README.md` says where the state, the ring requests, the map's layers, the phrase's slots and the events to PostHog are, how the source maps are uploaded, and how the screen tests run (`pnpm e2e`, Playwright).

## Deploy and services

A merge to `main` deploys both Workers through Cloudflare Workers Builds, and the monthly world build deploys each new dataset the same way. Deploys, checking and rerunning a build, a new worker, secrets and vars, the logs of every run, waiting for a GitHub Actions run, PostHog: read `docs/agents/infrastructure.md` before the first call. What only the Owner sets is in `worker/README.md`, «Deploy».

## Review

Reviewing a branch or merging a ticket's work: check the diff against `CODING_STANDARDS.md`.

## Subagents

- While subagents run, ask the Owner in a plain message or a Things task, note the open question, and keep dispatching the work it does not block: a question prompt holds every subagent's report until the Owner answers.
- In a worktree, give Bash one plain command with literal paths, edit files with Edit or Write, and run a script saved to a file with `python3 -I <file>`: the worktree guard refuses heredocs, `$VAR`, `$(…)`, loops and `cd … &&` chains.
- A subagent's worktree starts from this checkout's HEAD (`worktree.baseRef` in `.claude/settings.json`): check out the branch the work builds on before launching it.
- Notes shared with subagents hold only what the repo's docs lack, and link the docs for the rest.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `igorkamyshev/roadtrip`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Visa exemptions review

Reviewing or editing the visa exemptions' table or the Schengen area, the monthly run included: `docs/agents/visa-exemptions-review.md`.
