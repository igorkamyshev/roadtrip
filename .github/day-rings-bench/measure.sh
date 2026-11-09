#!/usr/bin/env bash
# The bench of #82 (docs/container-bench.md, «Кольца дней»): asks the engine server in the container `engine` for
# the rings of days D = 1…5 from each origin, each twice, and writes a row per ring to the run's summary: the
# traversal, the contour, their sum, the container's peak memory while it calculated (its cgroup's memory.current,
# sampled every 50 ms), and the ring's size as JSON raw and in gzip. D = 1 is the circle (0, 12] h, for comparison;
# D ≥ 2 is (12·(D − 1), 12·D]. The answers go to $OUT for the artifact.
#
#   .github/day-rings-bench/measure.sh <port>
set -euo pipefail

port=$1
out=${OUT:-rings}
mkdir -p "$out"
id=$(docker inspect -f '{{.Id}}' engine)
cgroup=$(find /sys/fs/cgroup -maxdepth 3 -type d -name "*$id*" | head -1)
echo "cgroup: $cgroup"

origins=(
	'Frankfurt 50.1109 8.6821'
	'Prague 50.0755 14.4378'
	'Madrid 40.4168 -3.7038'
	'Istanbul 41.0082 28.9784'
)

summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}
{
	echo '| Origin | D | Hours | Try | Outcome | Traversal, ms | Contour, ms | Total, s | Peak memory, MiB | JSON, MB | gzip, MB | Polygons | Points |'
	echo '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
} >> "$summary"

for origin in "${origins[@]}"; do
	read -r name lat lon <<< "$origin"
	for day in 1 2 3 4 5; do
		if [ "$day" = 1 ]; then lower=0; else lower=$((12 * (day - 1))); fi
		upper=$((12 * day))
		for try in 1 2; do
			file="$out/$name-$day-$try.json"
			body=$(printf '{"origin":{"lat":%s,"lon":%s},"lowerHours":%d,"upperHours":%d,"closedCountries":[]}' "$lat" "$lon" "$lower" "$upper")
			curl -fsS -X POST "localhost:$port/ring" -d "$body" -o "$file" &
			request=$!
			peak=0
			while kill -0 "$request" 2> /dev/null; do
				now=$(cat "$cgroup/memory.current")
				[ "$now" -le "$peak" ] || peak=$now
				sleep 0.05
			done
			wait "$request"
			bytes=$(stat -c %s "$file")
			gzipped=$(gzip -c "$file" | wc -c)
			jq -r --arg name "$name" --arg day "$day" --arg hours "$lower–$upper" --arg try "$try" \
				--argjson peak "$peak" --argjson bytes "$bytes" --argjson gzipped "$gzipped" '
				def mb: . / 1000000 * 100 | round / 100;
				"| \($name) | \($day) | \($hours) | \($try) | \(.outcome)"
				+ " | \(.timings.traversalMs | round) | \(.timings.contourMs | round)"
				+ " | \((.timings.traversalMs + .timings.contourMs) / 10 | round / 100)"
				+ " | \($peak / 1048576 | round) | \($bytes | mb) | \($gzipped | mb)"
				+ " | \(if .outcome == "ring" then (.ring.coordinates | length) else 0 end)"
				+ " | \(if .outcome == "ring" then ([.ring.coordinates[][] | length] | add) else 0 end) |"
			' "$file" | tee -a "$summary"
		done
	done
done

echo "The container's peak memory over the run: $(($(cat "$cgroup/memory.peak" 2> /dev/null || echo 0) / 1048576)) MiB" | tee -a "$summary"
