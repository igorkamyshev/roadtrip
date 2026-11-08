#!/usr/bin/env bash
# The last step of a heavy job of the world build: its steps' measures (measure.sh) as a table and its notes as a
# list, in the run's summary.
#
#   .github/dataset/summary.sh <title>
set -euo pipefail

{
	echo "#### $1"
	echo
	echo '| Шаг | Время | Пик памяти | Пик диска под файлы джобы |'
	echo '| --- | --- | --- | --- |'
	cat "${MEASURES:-/dev/null}"
	echo
	sed 's/^/- /' "${NOTES:-/dev/null}"
	echo
} >> "$GITHUB_STEP_SUMMARY"
