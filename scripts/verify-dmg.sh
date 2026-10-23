#!/bin/bash
set -euo pipefail
if [ "$#" != 1 ]; then echo "Usage: $0 path/to/OpenCast.dmg" >&2; exit 2; fi
DMG="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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
FRAMEWORK="$APP/Contents/Frameworks/Sparkle.framework"
for path in Sparkle Autoupdate Updater.app/Contents/MacOS/Updater; do
    test -x "$FRAMEWORK/$path"
done
otool -L "$APP/Contents/MacOS/OpenCast" | grep -Fq '@rpath/Sparkle.framework/'
otool -l "$APP/Contents/MacOS/OpenCast" | grep -Fq '@executable_path/../Frameworks'
for key in SUFeedURL SUPublicEDKey SUEnableAutomaticChecks SUAutomaticallyUpdate SUVerifyUpdateBeforeExtraction SURequireSignedFeed; do
    test "$(/usr/libexec/PlistBuddy -c "Print :$key" "$PLIST")" = \
        "$(/usr/libexec/PlistBuddy -c "Print :$key" "$ROOT/apps/macos/Resources/Info.plist")"
done
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
"$ROOT/scripts/verify-node.sh" "$APP/Contents/Resources/node/bin/node"
for path in backend/index.mjs frontend/main.html frontend/ai-chat.html frontend/notes.html \
    frontend/settings.html raycast-api/runtime.cjs raycast-api/worker.cjs \
    licenses/OpenCast-LICENSE.txt licenses/THIRD-PARTY-NOTICES.txt licenses/Node-LICENSE.txt \
    licenses/Inter-OFL.txt licenses/JetBrainsMono-OFL.txt licenses/Lucide-LICENSE.txt \
    licenses/Sparkle-LICENSE.txt licenses/inventory.json; do
    if [ ! -s "$APP/Contents/Resources/$path" ]; then
        echo "Missing release resource: $path" >&2; exit 1
    fi
done
"$APP/Contents/Resources/node/bin/node" --input-type=module - "$APP/Contents/Resources/licenses" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory = process.argv[2];
const inventory = JSON.parse(readFileSync(`${directory}/inventory.json`, 'utf8'));
assert.equal(inventory.node.version, process.versions.node, 'Node license version mismatch');
for (const [file, hash] of Object.entries(inventory.files)) {
  assert.equal(createHash('sha256').update(readFileSync(`${directory}/${file}`)).digest('hex'), hash, `Changed license: ${file}`);
}
for (const name of ['@fontsource-variable/inter', '@fontsource/jetbrains-mono', 'lucide-react', 'mathjs', 'highlight.js']) {
  assert(inventory.packages.some(p => p.name === name && p.version && p.license && p.sources.length), `Missing package notice: ${name}`);
}
assert.equal(inventory.files['Node-LICENSE.txt'], inventory.node.licenseSHA256);
JS
"$APP/Contents/Resources/node/bin/node" -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) process.exit(1);
const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync(":memory:");
if (db.prepare("SELECT 1 AS ok").get().ok !== 1) process.exit(1);
db.close();
'
echo "Verified mounted OpenCast $VERSION build $BUILD_NUMBER and bundled Node ($REVISION)"
