# roadtrip

`CLAUDE.md` is a symlink to this file, so edit `AGENTS.md` only. Any new `AGENTS.md` in a subfolder gets its own `CLAUDE.md` symlink, which the pre-commit hook creates (`node scripts/agents-symlinks.ts`) and CI checks, and a line under «Packages», which the pre-commit hook and `pnpm lint` check (`lint/agents-pointers.ts`).

## Packages

Read a package's `AGENTS.md` before working in it. None yet: the first package with its own `AGENTS.md` adds a line here, the path in backticks and what it covers.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `igorkamyshev/roadtrip`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
