#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ "$#" != 0 ]; then echo "Usage: $0" >&2; exit 2; fi
REPO="${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
VERSION="$(node -p 'require("./package.json").version')"
BUILD_NUMBER="$(git rev-list --count HEAD)"
TAG="v${VERSION}-build.${BUILD_NUMBER}"
OUT="$ROOT/build/releases/$TAG"
TOOL="$ROOT/apps/macos/.build/artifacts/sparkle/Sparkle/bin/generate_appcast"
test -s "$OUT/OpenCast-${VERSION}-build.${BUILD_NUMBER}-arm64.dmg"
ARGS=(--versions "$BUILD_NUMBER" --maximum-deltas 0
    --download-url-prefix "https://github.com/$REPO/releases/download/$TAG/"
    --link "https://github.com/$REPO/releases/tag/$TAG" "$OUT")
if [ -n "${SPARKLE_PRIVATE_KEY:-}" ]; then
    # Keep the private key out of process arguments, disk, and build logs.
    printf '%s\n' "$SPARKLE_PRIVATE_KEY" | "$TOOL" --ed-key-file - "${ARGS[@]}"
else
    "$TOOL" --account opencast "${ARGS[@]}"
fi
test -s "$OUT/appcast.xml"
node scripts/verify-macos-update.mjs "$OUT" "OpenCast-${VERSION}-build.${BUILD_NUMBER}-arm64" \
    "$VERSION" "$BUILD_NUMBER" "$(git rev-parse HEAD)" "$REPO"
