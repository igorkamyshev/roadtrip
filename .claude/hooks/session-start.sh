#!/bin/bash
# SessionStart hook (.claude/settings.json), cloud sessions only. Stdout reaches
# the agent's context, so every command here writes to stderr.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
	exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# The pre-commit hook (CLAUDE.md symlinks, the staged files' lint and format, the
# project's checks) runs only once git knows where it lives. `pnpm install` sets
# it too, but a failed install must not leave commits unchecked.
git config core.hooksPath .githooks

# The tests and the lint hook (lint/claude-hook.ts) need node_modules. Install
# only when a file that decides the install changed since the last successful one.
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
	rm -f "$hashes"
	pnpm install --frozen-lockfile >&2
	sha256sum .claude/hooks/session-start.sh pnpm-lock.yaml .nvmrc package.json > "$hashes"
fi
