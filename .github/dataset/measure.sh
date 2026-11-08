#!/usr/bin/env bash
# A step of the world build (.github/workflows/dataset.yml) under /usr/bin/time: runs the command, then adds a row
# with its time, its peak memory and the disk in use after it to $MEASURES, the job's table for the run's summary,
# prints the row and exits as the command did.
#
#   .github/dataset/measure.sh <what> <command> [<argument>…]
set -uo pipefail

what=$1
shift
started=$(date +%s)
/usr/bin/time -f '%M' -o "$RUNNER_TEMP/peak-rss" "$@"
status=$?
seconds=$(($(date +%s) - started))
peak_kb=$(tail -1 "$RUNNER_TEMP/peak-rss")
disk=$(df -B1 --output=used "${WORK:-/}" | tail -1)
row=$(printf '| %s | %d:%02d | %s GB | %s GB |%s' "$what" $((seconds / 60)) $((seconds % 60)) \
	"$(awk -v kb="$peak_kb" 'BEGIN { printf "%.2f", kb / 1048576 }')" "$(awk -v bytes="$disk" 'BEGIN { printf "%.1f", bytes / 1e9 }')" \
	"$([ "$status" -eq 0 ] || echo " exit $status |")")
echo "$row" | tee -a "$MEASURES"
exit "$status"
