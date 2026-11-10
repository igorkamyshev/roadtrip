#!/usr/bin/env bash
# The rings of the world graph (.github/workflows/world-rings.yml): each ring of $RINGS, `<name> <lat> <lon> <from>
# <to>` separated by `;`, closed countries $CLOSED (alpha-3, comma-separated), as GeoJSON into $OUT/<name>-<from>-<to>
# .geojson, as `pnpm --filter data render` draws it. In mode `ring` the `ring` command computes them on the runner; in
# mode `container` the Container's image in Docker under standard-2's limits (1 vCPU, 6 GiB) answers each ring twice,
# and the run's summary gets a row per answer: the traversal, the contour, the container's peak memory
# (memory.current, sampled every 50 ms) and the size as JSON and in gzip.
#
#   RINGS='Frankfurt 50.1109 8.6821 36 48; …' CLOSED= OUT=rings .github/world-rings/run.sh <ring | container>
set -euo pipefail

mode=$1
out=$(realpath -m "${OUT:-rings}")
mkdir -p "$out"
closed=$(jq -cn --arg closed "${CLOSED:-}" '$closed | split(",") | map(select(. != ""))')
IFS=';' read -ra rings <<< "$RINGS"
summary=${GITHUB_STEP_SUMMARY:-/dev/stdout}

# The Container's answer, a Calculation, as the GeoJSON `ring` writes.
as_geojson() {
	jq -c '{ type: "FeatureCollection", features: [{ type: "Feature", geometry: (if .outcome == "ring" then .ring else null end),
		properties: { outcome, startCountry, maxHours, timings } }] }'
}

if [ "$mode" = container ]; then
	docker build -q -f engine/Dockerfile -t roadtrip-engine .
	docker run -d --name engine --cpus 1 --memory 6g -p 8080:8080 roadtrip-engine
	curl -fsS --retry 60 --retry-all-errors --retry-delay 1 -o /dev/null -X POST localhost:8080/ring \
		-d '{"origin":{"lat":0,"lon":0},"lowerHours":0,"upperHours":1,"closedCountries":[]}'
	docker logs engine
	cgroup=$(find /sys/fs/cgroup -maxdepth 3 -type d -name "*$(docker inspect -f '{{.Id}}' engine)*" | head -1)
	{
		echo '| Ring | Hours | Try | Outcome | Traversal, ms | Contour, ms | Total, s | Peak memory, MiB | JSON, MB | gzip, MB | Polygons |'
		echo '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	} >> "$summary"
fi

for ring in "${rings[@]}"; do
	read -r name lat lon from to <<< "$ring"
	file="$out/$name-$from-$to.geojson"
	if [ "$mode" = ring ]; then
		node data/src/cli/ring.ts "$PWD/engine/dataset/graph.graph" --lat "$lat" --lon "$lon" --from "$from" --hours "$to" \
			--closed "${CLOSED:-}" --out "$file"
		echo "$name $from–$to: $(stat -c %s "$file") bytes" | tee -a "$summary"
		continue
	fi
	body=$(jq -cn --argjson lat "$lat" --argjson lon "$lon" --argjson from "$from" --argjson to "$to" --argjson closed "$closed" \
		'{ origin: { lat: $lat, lon: $lon }, lowerHours: $from, upperHours: $to, closedCountries: $closed }')
	for try in 1 2; do
		answer="$out/$name-$from-$to.$try.json"
		curl -fsS -X POST localhost:8080/ring -d "$body" -o "$answer" &
		request=$!
		peak=0
		while kill -0 "$request" 2> /dev/null; do
			now=$(cat "$cgroup/memory.current")
			[ "$now" -le "$peak" ] || peak=$now
			sleep 0.05
		done
		wait "$request"
		jq -r --arg name "$name" --arg hours "$from–$to" --arg try "$try" --argjson peak "$peak" \
			--argjson bytes "$(stat -c %s "$answer")" --argjson gzipped "$(gzip -c "$answer" | wc -c)" '
			def mb: . / 1000000 * 100 | round / 100;
			"| \($name) | \($hours) | \($try) | \(.outcome) | \(.timings.traversalMs | round) | \(.timings.contourMs | round)"
			+ " | \((.timings.traversalMs + .timings.contourMs) / 10 | round / 100) | \($peak / 1048576 | round)"
			+ " | \($bytes | mb) | \($gzipped | mb) | \(if .outcome == "ring" then (.ring.coordinates | length) else 0 end) |"
		' "$answer" | tee -a "$summary"
	done
	as_geojson < "$out/$name-$from-$to.1.json" > "$file"
done
