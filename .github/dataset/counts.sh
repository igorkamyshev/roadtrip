#!/usr/bin/env bash
# What an OSM file of the world build holds, for its notes: its size and its counts of ways, nodes and relations.
#
#   .github/dataset/counts.sh <file.pbf>
set -euo pipefail

osmium fileinfo -e -j "$1" | jq -r --arg name "$(basename "$1")" --argjson bytes "$(stat -c %s "$1")" \
	'"\($name): \($bytes / 1e6 | floor) MB, \(.data.count.ways) ways, \(.data.count.nodes) nodes, \(.data.count.relations) relations"'
