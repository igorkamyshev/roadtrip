#!/usr/bin/env bash
# Installs packages with apt for a job of the world build. When the runner cannot resolve Ubuntu's own mirrors, as on
# 2026-11-11, when every *.ubuntu.com failed to resolve on the runners for hours while other hosts did, apt takes the
# same archive from kernel.org's mirror. It first prints which of the hosts the build needs resolve.
#
#   .github/dataset/apt.sh <package>…
set -euo pipefail

for host in azure.archive.ubuntu.com security.ubuntu.com mirrors.edge.kernel.org download.geofabrik.de; do
	if getent hosts "$host" > /dev/null; then echo "$host resolves"; else echo "::warning::$host does not resolve"; fi
done

if ! getent hosts azure.archive.ubuntu.com > /dev/null; then
	# The runner's sources take every suite, the security one too, from the mirrors this file lists.
	echo "::warning::apt takes the packages from mirrors.edge.kernel.org"
	printf 'http://mirrors.edge.kernel.org/ubuntu/\tpriority:1\n' | sudo tee /etc/apt/apt-mirrors.txt > /dev/null
	sudo sed -i -E 's#https?://([a-z0-9.-]+\.)?(archive|security)\.ubuntu\.com/ubuntu/?#http://mirrors.edge.kernel.org/ubuntu/#g' \
		/etc/apt/sources.list.d/*.sources /etc/apt/sources.list 2> /dev/null || true
fi

sudo apt-get -o Acquire::Retries=3 update -qq
sudo apt-get -o Acquire::Retries=3 install -y -qq "$@" > /dev/null
