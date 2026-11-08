#!/usr/bin/env bash
# The first step of a heavy job of the world build: prints the runner, frees its disk of preinstalled software the
# build does not use, and picks the work directory on the file system with the most free space. Sets WORK, and
# MEASURES and NOTES, the files measure.sh and the steps write for summary.sh, for the job's next steps.
set -euo pipefail

lscpu | grep -E '^(Model name|CPU\(s\))'
free -h
df -h / /mnt || true
started=$(date +%s)
sudo rm -rf /usr/share/dotnet /usr/local/lib/android /opt/ghc /usr/local/.ghcup /opt/hostedtoolcache/CodeQL \
	/usr/local/share/boost /usr/share/swift /usr/local/share/powershell /usr/local/share/chromium /opt/microsoft /opt/google
sudo docker image prune --all --force > /dev/null
echo "freed the disk in $(($(date +%s) - started)) s"
df -h / /mnt || true

root=$(df -B1 --output=avail / | tail -1)
mnt=$(df -B1 --output=avail /mnt 2> /dev/null | tail -1 || echo 0)
if [ "${mnt:-0}" -gt "$root" ]; then work=/mnt/dataset; else work=$HOME/dataset; fi
sudo mkdir -p "$work"
sudo chown "$(id -u):$(id -g)" "$work"
{
	echo "WORK=$work"
	echo "MEASURES=$RUNNER_TEMP/measures.md"
	echo "NOTES=$RUNNER_TEMP/notes.md"
} >> "$GITHUB_ENV"
touch "$RUNNER_TEMP/measures.md"
echo "Раннер: $(nproc) vCPU, $(free -g | awk '/^Mem/ { print $2 }') GiB памяти, $(df -h --output=avail "$work" | tail -1 | tr -d ' ') свободно в $work" > "$RUNNER_TEMP/notes.md"
cat "$RUNNER_TEMP/notes.md"
