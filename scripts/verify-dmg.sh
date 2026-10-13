#!/bin/bash
set -euo pipefail
if [ "$#" != 1 ]; then echo "Usage: $0 path/to/OpenCast.dmg" >&2; exit 2; fi
DMG="$1"
hdiutil verify "$DMG"
MOUNT="$(mktemp -d "${TMPDIR:-/tmp}/opencast-dmg.XXXXXX")"
MOUNTED=0
cleanup() {
    if [ "$MOUNTED" = 1 ]; then hdiutil detach "$MOUNT" >/dev/null; fi
    rmdir "$MOUNT"
}
trap cleanup EXIT
hdiutil attach -readonly -nobrowse -mountpoint "$MOUNT" "$DMG" >/dev/null
MOUNTED=1
APP="$MOUNT/OpenCast.app"
PLIST="$APP/Contents/Info.plist"
codesign --verify --deep --strict "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$PLIST")" = OpenCast
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$PLIST")" = OpenCast
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST")" = OpenCast
test "$(diskutil info -plist "$MOUNT" | plutil -extract VolumeName raw -o - -)" = OpenCast
test "$(readlink "$MOUNT/Applications")" = /Applications
REVISION="$(/usr/libexec/PlistBuddy -c 'Print :OpenCastSourceRevision' "$PLIST")"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
BUILD_NUMBER="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")"
[[ "$REVISION" =~ ^[0-9a-f]{40}$ ]]
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]
if [ -n "${OPENCAST_EXPECTED_REVISION:-}" ]; then test "$REVISION" = "$OPENCAST_EXPECTED_REVISION"; fi
if [ -n "${OPENCAST_EXPECTED_VERSION:-}" ]; then test "$VERSION" = "$OPENCAST_EXPECTED_VERSION"; fi
if [ -n "${OPENCAST_EXPECTED_BUILD_NUMBER:-}" ]; then test "$BUILD_NUMBER" = "$OPENCAST_EXPECTED_BUILD_NUMBER"; fi
for binary in Contents/MacOS/OpenCast Contents/Resources/node/bin/node; do
    test "$(lipo -archs "$APP/$binary")" = "$(uname -m)"
done
for path in backend/index.mjs frontend/main.html frontend/ai-chat.html frontend/notes.html \
    frontend/settings.html raycast-api/runtime.cjs raycast-api/worker.cjs; do
    test -s "$APP/Contents/Resources/$path"
done
"$APP/Contents/Resources/node/bin/node" -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(":memory:");
if (db.prepare("SELECT 1 AS ok").get().ok !== 1) process.exit(1);
db.close();
'
echo "Verified mounted OpenCast $VERSION build $BUILD_NUMBER and bundled Node ($REVISION)"
