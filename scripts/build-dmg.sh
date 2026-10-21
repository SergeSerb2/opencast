#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ "$(uname -s)" != Darwin ]; then echo 'DMG packaging requires macOS' >&2; exit 1; fi
if [ "$(uname -m)" != arm64 ]; then
    echo 'OpenCast releases support Apple silicon (arm64) only; build on an arm64 Mac' >&2; exit 1
fi
if [ "$#" != 0 ]; then echo "Usage: $0" >&2; exit 2; fi
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    echo 'Fetch the full Git history before assigning a release build number' >&2; exit 1
fi
VERSION="$(node -p 'require("./package.json").version')"
BUILD_NUMBER="$(git rev-list --count HEAD)"
REVISION="$(git rev-parse HEAD)"
ARCH="$(uname -m)"
TAG="v${VERSION}-build.${BUILD_NUMBER}"
OUT="$ROOT/build/releases/$TAG"
NAME="OpenCast-${VERSION}-build.${BUILD_NUMBER}-${ARCH}"
export OPENCAST_VERSION="$VERSION" OPENCAST_BUILD_NUMBER="$BUILD_NUMBER"
export OPENCAST_NODE="${OPENCAST_NODE:-$(./scripts/prepare-release-node.sh)}"
./scripts/verify-node.sh "$OPENCAST_NODE"
./scripts/build-app.sh --bundle-node
APP="$ROOT/build/OpenCast.app"
for path in Contents/MacOS/OpenCast Contents/Resources/backend/index.mjs \
    Contents/Resources/frontend/main.html Contents/Resources/frontend/ai-chat.html \
    Contents/Resources/frontend/notes.html Contents/Resources/frontend/settings.html \
    Contents/Resources/raycast-api/runtime.cjs Contents/Resources/raycast-api/worker.cjs \
    Contents/Resources/node/bin/node; do
    if [ ! -s "$APP/$path" ]; then echo "Missing release component: $path" >&2; exit 1; fi
done
mkdir -p "$OUT"
STAGE="$(mktemp -d "$ROOT/build/.dmg-stage.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
ditto "$APP" "$STAGE/OpenCast.app"
ln -s /Applications "$STAGE/Applications"
cat > "$STAGE/Read Me.txt" <<EOF
OpenCast $VERSION (build $BUILD_NUMBER) — $ARCH

Drag OpenCast.app to Applications, then open it from Applications.
Node is included; no development tools are needed to run the app.

This build is ad-hoc signed and is not notarized. If macOS blocks it, use
System Settings > Privacy & Security > Open Anyway after trying to open it.
https://support.apple.com/guide/mac-help/mh40616/mac

Source commit: $REVISION
EOF
hdiutil create -ov -volname OpenCast -srcfolder "$STAGE" -fs HFS+ -format UDZO "$OUT/$NAME.dmg"
OPENCAST_EXPECTED_REVISION="$REVISION" OPENCAST_EXPECTED_VERSION="$VERSION" \
    OPENCAST_EXPECTED_BUILD_NUMBER="$BUILD_NUMBER" ./scripts/verify-dmg.sh "$OUT/$NAME.dmg"
(
    cd "$OUT"
    shasum -a 256 "$NAME.dmg" > "$NAME.dmg.sha256"
)
node --input-type=module - "$OUT/$NAME.json" "$VERSION" "$BUILD_NUMBER" "$REVISION" "$ARCH" "$NAME.dmg" <<'JS'
import { writeFileSync } from 'node:fs';
const [path, version, build, revision, architecture, asset] = process.argv.slice(2);
writeFileSync(path, JSON.stringify({ version, build: Number(build), revision, architecture,
  asset, signing: 'ad-hoc', notarized: false, builtOn: 'macOS' }, null, 2) + '\n');
JS
echo "Packaged $OUT/$NAME.dmg"
