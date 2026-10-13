#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/opencast-icon.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/AppIcon.iconset" "$ROOT/apps/macos/Resources"
qlmanage -t -s 1024 -o "$WORK" "$ROOT/assets/icon.svg" >/dev/null 2>&1
SOURCE="$WORK/icon.svg.png"
if [ ! -f "$SOURCE" ]; then echo 'Failed to render assets/icon.svg' >&2; exit 1; fi
for size in 16 32 128 256 512; do
    sips -z "$size" "$size" "$SOURCE" --out "$WORK/AppIcon.iconset/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" "$SOURCE" --out "$WORK/AppIcon.iconset/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$ROOT/apps/macos/Resources/AppIcon.icns"
echo "Generated apps/macos/Resources/AppIcon.icns"
