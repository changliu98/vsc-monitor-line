#!/usr/bin/env bash
set -euo pipefail

VERSION=$(grep '"version"' package.json | sed 's/[^0-9\.]//g')
VSIX="system-monitor-${VERSION}.vsix"

echo "→ Building in Docker (version ${VERSION})..."
docker build -t vsc-monitor-builder -f Dockerfile.build .

echo "→ Extracting ${VSIX}..."
docker run --rm vsc-monitor-builder cat "/build/${VSIX}" > "${VSIX}"

echo "✓ ${VSIX} ($(du -h "${VSIX}" | cut -f1))"
