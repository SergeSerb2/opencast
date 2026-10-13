#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/opencast-icon.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/AppIcon.iconset" "$ROOT/apps/macos/Resources"
SOURCE="$WORK/icon.png"
# Quick Look flattens transparent SVG corners onto white. Render the source
# directly so the app icon keeps its rounded silhouette in the Dock.
pnpm dlx @resvg/resvg-js-cli@2.6.2-beta.1 --no-system-font --fit-width 1024 "$ROOT/assets/icon.svg" "$SOURCE"
if [ ! -f "$SOURCE" ]; then echo 'Failed to render assets/icon.svg' >&2; exit 1; fi
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$SOURCE" --out "$WORK/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$SOURCE" --out "$WORK/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$ROOT/apps/macos/Resources/AppIcon.icns"
echo "Generated apps/macos/Resources/AppIcon.icns"
