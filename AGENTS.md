# roadtrip

`CLAUDE.md` is a symlink to this file, so edit `AGENTS.md` only. Any new `AGENTS.md` in a subfolder gets its own `CLAUDE.md` symlink, which the pre-commit hook creates (`node scripts/agents-symlinks.ts`) and CI checks, and a line under «Packages», which the pre-commit hook and `pnpm lint` check (`lint/agents-pointers.ts`).

## Packages

Read a package's `AGENTS.md` before working in it:

- `engine/AGENTS.md`: the ring engine, keeping it portable, when to bump the engine version and record its fingerprint, where its tests live; the engine server of the Container and its image.
- `data/AGENTS.md`: the graph builder, the zone outlines, the cities file, the `ring` and `build-cities` commands, rings on real roads and their pictures (`region`, `render`), the fixtures; the monthly world build (`.github/workflows/dataset.yml`) and the dataset in R2 with its pointer `current.json`.

`rules` holds the tables edited by hand: the border table, the visa exemptions' table (`VISA_EXEMPTIONS`), the Schengen area, the countries as zones (`COUNTRIES`) and Sherpa's 199 passports (`SHERPA_PASSPORTS`); it has no `AGENTS.md` yet.

`error-tracking` is the Tail Worker that turns the Workers' errors into PostHog `$exception` events, and the home of the logger they write with (`import { logger } from 'error-tracking/logger'`). Its `README.md` says how a Worker attaches it and writes `logger.error`.

`worker` is the Worker `roadtrip`: `GET /api/ring` from the ring cache in KV or the Container with the engine, the visa rules from Sherpa with their copies in KV and their reduction, the Worker's events in PostHog (`ring served`, `sherpa fetched`), the `EngineContainer` class and the wrangler config; and the prototype stand `roadtrip-stand` (`worker/stand/`). Its `README.md` says how a request goes, how the visa rules are loaded and kept, what the events say, where the routes and `deps` are built, how to run it locally with the Container, and how to put a prototype's branch on the stand, which stays on after the Owner's choice, and switch it off when the Owner asks.

`web` is the client, the one screen, built into the Worker's static assets. Its `README.md` says where the state, the ring requests, the map's layers, the phrase's slots and the events to PostHog are, how the source maps are uploaded, how the screen tests run (`pnpm e2e`, Playwright), and how to show the screen without the Worker (`pnpm --filter web demo`, a video of it).

`lint` holds roadtrip's own lint rules (an Oxlint JS plugin, `lint/plugin.ts`, each rule in `lint/rules/` with its tests), the checks of the project that fallow cannot express, fallow's policy pack, and the Claude Code hook that lints an agent's edits.

## Checks

Every finding of Oxlint, Stylelint, fallow and our own rules in `lint/` is an error ([ADR 0002](docs/adr/0002-strict-checks-oxlint-fallow-oxfmt.md)). A hook lints the source files you change once you move on, at your next shell command or when you stop; pre-commit formats, autofixes (then typechecks, if a fix changed a file) and checks the whole project; CI runs `.github/workflows/checks.yml`. The client's build fails when the first paint's JavaScript is over its budget (`web/vite.config.ts`).

- Fix the code until the checks pass: `pnpm format`, `pnpm lint`.
- A rule that is wrong for one line is disabled on that line, by name, with the reason: `// oxlint-disable-next-line <rule> -- <why>`, in CSS `/* stylelint-disable-next-line <rule> -- <why> */`.
- The rule set (`.oxlintrc.json`, `stylelint.config.mjs`, `.fallowrc.jsonc`, `lint/`) is the Owner's call: propose a change with its reason instead of making it. A new package is one: fallow wants a zone for its files in `.fallowrc.jsonc`'s `boundaries`.
- Before a refactor, `pnpm health` shows where complexity and churn pile up.

## Deploy and services

A merge to `main` deploys both Workers through Cloudflare Workers Builds, and the monthly world build deploys each new dataset the same way. Deploys, checking and rerunning a build, a new worker, secrets and vars, the logs of every run, waiting for a GitHub Actions run, PostHog: read `docs/agents/infrastructure.md` before the first call. What only the Owner sets is in `worker/README.md`, «Deploy».

## Review

Reviewing a branch or merging a ticket's work, the review step of `mattpocock-skills:implement` included: `mattpocock-skills:code-review`, which checks the whole diff, tests too, against `CODING_STANDARDS.md` and the ticket, and the PR's description, when there is one, against the diff. A PR opened after that review gets its description checked before the merge: every claim in it, «Merge Danger» included, is one the diff, the code or a run shows.

## A cloud session's branch

A cloud session pushes to the branch it was given, and may not force-push: that is how it is set up. A PR merges with a merge commit, which keeps its commits in `main`. Once a PR of it is merged, start the next one from `main` on the same branch, with the branch's old tip merged in, so the push is a fast-forward: `git checkout -B <branch> origin/main`, `git merge -s ours origin/<branch>`. A stack of PRs, each built on the one below: `docs/agents/stacked-prs.md`.

## Subagents

- While subagents run, ask the Owner in a plain message or a Things task, note the open question, and keep dispatching the work it does not block: a question prompt holds every subagent's report until the Owner answers.
- In a worktree, give Bash one plain command with literal paths, edit files with Edit or Write, and run a script saved to a file with `python3 -I <file>`: the worktree guard refuses heredocs, `$VAR`, `$(…)`, loops and `cd … &&` chains.
- A subagent's worktree starts from this checkout's HEAD (`worktree.baseRef` in `.claude/settings.json`): check out the branch the work builds on before launching it. That holds only when Claude Code runs in this checkout: a session started in a folder above it (a cloud session with several repositories) loads none of this repository's `.claude/settings.json`, neither `baseRef` nor the hooks, and the worktree starts at `origin/main`. So the brief names the commit the work builds on, and the subagent first moves its branch there (`git merge --ff-only <commit>`).
- Notes shared with subagents hold only what the repo's docs lack, and link the docs for the rest.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `igorkamyshev/roadtrip`. See `docs/agents/issue-tracker.md`.

Every change starts from an issue: file one before the first edit when none exists, and the PR's description says `Closes #N` (or `Part of #N`), which CI's check «Issue» reads. A retro's change is `Part of #N` of the issue it looks back on.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`. The spec is `docs/specs/20.md`, a frozen copy of issue #20, with what has changed since in `docs/specs/20-amendments.md`: «spec #20 «Раздел»» is that section with its amendments, and where they differ the amendment is right.

### Visa exemptions review

Reviewing or editing the visa exemptions' table or the Schengen area, the monthly run included: `docs/agents/visa-exemptions-review.md`.
