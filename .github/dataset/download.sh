#!/usr/bin/env bash
# Downloads a file of Geofabrik's, resuming after a broken connection, and checks it against its .md5.
#
#   .github/dataset/download.sh <file name at download.geofabrik.de> <path to save it at>
set -euo pipefail

name=$1
path=$2
for attempt in 1 2 3 4 5 6; do
	if curl -fsSL -C - -o "$path" "https://download.geofabrik.de/$name"; then
		break
	fi
	echo "::warning::$name: attempt $attempt failed"
	[ "$attempt" -lt 6 ] || exit 1
	sleep 60
done
expected=$(curl -fsSL --retry 5 "https://download.geofabrik.de/$name.md5" | cut -d ' ' -f 1)
actual=$(md5sum "$path" | cut -d ' ' -f 1)
if [ "$expected" != "$actual" ]; then
	echo "::error::$name: MD5 $actual, Geofabrik says $expected"
	exit 1
fi
echo "$name: $(awk -v bytes="$(stat -c %s "$path")" 'BEGIN { printf "%.2f", bytes / 1e9 }') GB, MD5 checked"
