#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .build
# Public trust bundle only; no private certificates or keys enter the image.
cp "${AX_BUILD_CA_BUNDLE:-/etc/ssl/certs/ca-certificates.crt}" .build/ca-certificates.crt
docker build -t ax-for-works:local .
