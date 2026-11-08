#!/usr/bin/env bash
# A step of the world build (.github/workflows/dataset.yml) under /usr/bin/time: runs the command, then adds a row
# to $MEASURES, the job's table for the run's summary: its time, its peak memory, and the peak disk the job's files
# took while it ran (the disk in use, sampled every 5 s, less what was in use when runner.sh had freed the disk).
# Prints the row and exits as the command did.
#
#   .github/dataset/measure.sh <what> <command> [<argument>…]
set -uo pipefail

what=$1
shift
used() { df -B1 --output=used "${WORK:-/}" | tail -1; }
used > "$RUNNER_TEMP/peak-disk"
(
	while sleep 5; do
		now=$(used)
		[ "$now" -le "$(cat "$RUNNER_TEMP/peak-disk")" ] || echo "$now" > "$RUNNER_TEMP/peak-disk"
	done
) &
sampler=$!
started=$(date +%s)
/usr/bin/time -f '%M' -o "$RUNNER_TEMP/peak-rss" "$@"
status=$?
seconds=$(($(date +%s) - started))
kill "$sampler"
now=$(used)
[ "$now" -le "$(cat "$RUNNER_TEMP/peak-disk")" ] || echo "$now" > "$RUNNER_TEMP/peak-disk"
disk=$(($(cat "$RUNNER_TEMP/peak-disk") - $(cat "$RUNNER_TEMP/disk-baseline" 2> /dev/null || echo 0)))
peak_kb=$(tail -1 "$RUNNER_TEMP/peak-rss")
row=$(printf '| %s | %d:%02d | %s GB | %s GB |%s' "$what" $((seconds / 60)) $((seconds % 60)) \
	"$(awk -v kb="$peak_kb" 'BEGIN { printf "%.2f", kb / 1048576 }')" "$(awk -v bytes="$disk" 'BEGIN { printf "%.1f", bytes / 1e9 }')" \
	"$([ "$status" -eq 0 ] || echo " exit $status |")")
echo "$row" | tee -a "$MEASURES"
exit "$status"
