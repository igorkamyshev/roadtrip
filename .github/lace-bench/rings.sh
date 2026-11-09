#!/usr/bin/env bash
# The bench of the lace of #77 (docs/container-bench.md, «Кружево колец дней»): the rings of days of the world graph
# with each growth of the small plot, written as GeoJSON into $OUT/<variant>/ for the artifact. A variant is
# SMALL_PLOT_GROWTH in engine/src/contour.ts, or `before`: 200 km² at every bound, as before the growth.
#
#   .github/lace-bench/rings.sh <variant>…
set -euo pipefail

out=$(realpath -m "${OUT:-rings}")
rings=(
	'Belgrade 44.8176 20.4573 24 36'
	'Moscow 55.7558 37.6173 12 24'
	'Frankfurt 50.1109 8.6821 36 48'
	'Istanbul 41.0082 28.9784 36 48'
	'Madrid 40.4168 -3.7038 48 60'
)
contour=engine/src/contour.ts
cp "$contour" "$RUNNER_TEMP/contour.ts"
for variant in "$@"; do
	cp "$RUNNER_TEMP/contour.ts" "$contour"
	if [ "$variant" = before ]; then
		sed -i 's/^const SMALL_PLOT_FROM_SECONDS = .*;/const SMALL_PLOT_FROM_SECONDS = Infinity;/' "$contour"
	else
		sed -i "s/^const SMALL_PLOT_GROWTH = .*;/const SMALL_PLOT_GROWTH = $variant;/" "$contour"
	fi
	grep -E '^const SMALL_PLOT_(FROM_SECONDS|GROWTH)' "$contour"
	mkdir -p "$out/$variant"
	for ring in "${rings[@]}"; do
		read -r name lat lon from to <<< "$ring"
		node data/src/cli/ring.ts "$PWD/engine/dataset/graph.graph" --lat "$lat" --lon "$lon" --from "$from" --hours "$to" \
			--out "$out/$variant/$name-$from-$to.geojson"
		echo "$variant $name $from–$to: $(stat -c %s "$out/$variant/$name-$from-$to.geojson") bytes"
	done
done
cp "$RUNNER_TEMP/contour.ts" "$contour"
