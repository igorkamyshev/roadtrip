#!/usr/bin/env bash
# The last step of the world build (#36): starts the build of the Worker roadtrip in Cloudflare Workers Builds, whose
# deploy takes the dataset current.json now points at (data/src/cli/fetch-dataset.ts), and waits for its outcome, so
# that a failed deploy fails the run. The same request as a build started by hand (docs/agents/infrastructure.md).
# On a failure it prints the end of the build's log.
#
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… .github/dataset/deploy.sh <trigger uuid> <branch>
set -euo pipefail

trigger=$1
branch=$2
builds="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/builds"

# Cloudflare's API: `call <method> <path> [<JSON body>]` puts the answer's result in $result, or prints its errors and
# ends the script. Called outside a subshell, so that its exit ends the script.
call() {
	local response
	response=$(curl -sS -X "$1" "$builds/$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' ${3:+--data "$3"})
	if [ "$(jq -r '.success // false' <<< "$response" 2> /dev/null)" != true ]; then
		echo "::error::Cloudflare answered $1 $2 with: $(jq -c '.errors // .' <<< "$response" 2> /dev/null || echo "$response")"
		exit 1
	fi
	result=$(jq -c .result <<< "$response")
}

call POST "triggers/$trigger/builds" "$(jq -cn --arg branch "$branch" '{ branch: $branch }')"
build=$(jq -r .build_uuid <<< "$result")
echo "build $build of $branch started"
# A build has 20 minutes once it runs; it may wait in the queue before that.
for _ in $(seq 120); do
	sleep 15
	call GET "builds/$build"
	[ "$(jq -r .status <<< "$result")" != stopped ] || break
done
status=$(jq -r .status <<< "$result")
outcome=$(jq -r .build_outcome <<< "$result")
line="Сборка \`$build\` Worker'а roadtrip в Workers Builds, ветка \`$branch\`: $status, $outcome, с $(jq -r .running_on <<< "$result") по $(jq -r .stopped_on <<< "$result")."
echo "$line"
[ -z "${GITHUB_STEP_SUMMARY:-}" ] || printf '### Деплой\n\n%s\n' "$line" >> "$GITHUB_STEP_SUMMARY"
if [ "$outcome" != success ]; then
	call GET "builds/$build/logs"
	jq -r '.lines[] | if type == "array" then .[1] else . end' <<< "$result" | tail -40
	echo "::error::The build $build of the Worker roadtrip ended $status, $outcome"
	exit 1
fi
