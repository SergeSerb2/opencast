#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
CONFIG=release
BUNDLE_NODE=0
SKIP_WEB=0
OPEN_APP=0
for arg in "$@"; do
    case "$arg" in
        --debug) CONFIG=debug ;;
        --bundle-node) BUNDLE_NODE=1 ;;
        --skip-web) SKIP_WEB=1 ;;
        --open) OPEN_APP=1 ;;
        *) echo "Usage: $0 [--debug] [--bundle-node] [--skip-web] [--open]" >&2; exit 2 ;;
    esac
done
APP_VERSION="${OPENCAST_VERSION:-$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' apps/macos/Resources/Info.plist)}"
BUILD_NUMBER="${OPENCAST_BUILD_NUMBER:-1}"
SOURCE_REVISION="$(git rev-parse HEAD)"
if [[ ! "$APP_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
    echo 'App version must be three numeric components; build number must be a positive integer' >&2
    exit 1
fi
if [ "$SKIP_WEB" = 0 ]; then
    if [ ! -d node_modules ]; then pnpm install --frozen-lockfile; fi
    for package in frontend backend raycast-api; do
        # In-progress packages can have a build script before they have source/output.
        if pnpm --filter "@opencast/$package" build; then
            if [ ! -d "packages/$package/dist" ]; then echo "Warning: $package has no dist output yet; skipping bundle copy" >&2; fi
        elif [ ! -d "packages/$package/dist" ]; then
            echo "Warning: $package is not buildable yet and has no dist output; continuing native assembly" >&2
        else
            echo "Error: $package build failed with existing output; refusing stale artifacts" >&2
            exit 1
        fi
    done
fi
swift build -c "$CONFIG" --package-path apps/macos
BIN_DIR="$(swift build -c "$CONFIG" --package-path apps/macos --show-bin-path)"
APP="$ROOT/build/OpenCast.app"
# Assemble in a sibling staging directory so a failed build preserves the previous app.
mkdir -p "$ROOT/build"
STAGE="$(mktemp -d "$ROOT/build/.OpenCast.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/Contents/MacOS" "$STAGE/Contents/Resources"
cp "$BIN_DIR/OpenCast" "$STAGE/Contents/MacOS/OpenCast"
cp apps/macos/Resources/Info.plist "$STAGE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $APP_VERSION" "$STAGE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD_NUMBER" "$STAGE/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Add :OpenCastSourceRevision string $SOURCE_REVISION" "$STAGE/Contents/Info.plist"
if [ ! -f apps/macos/Resources/AppIcon.icns ]; then ./scripts/make-icon.sh; fi
cp apps/macos/Resources/AppIcon.icns "$STAGE/Contents/Resources/AppIcon.icns"
if [ "$SKIP_WEB" = 0 ]; then
    for package in frontend backend raycast-api; do
        if [ -d "packages/$package/dist" ]; then ditto "packages/$package/dist" "$STAGE/Contents/Resources/$package"; else echo "Warning: omitting $package; no build output" >&2; fi
    done
fi
if [ "$BUNDLE_NODE" = 1 ]; then
    NODE="${OPENCAST_NODE:-${SURGECAST_NODE:-}}"
    if [ -z "$NODE" ] && [ -x "$APP/Contents/Resources/node/bin/node" ]; then NODE="$APP/Contents/Resources/node/bin/node"; fi
    if [ -z "$NODE" ]; then NODE="$("${SHELL:-/bin/zsh}" -lc 'command -v node' || true)"; fi
    if [ -z "$NODE" ]; then for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do if [ -x "$candidate" ]; then NODE="$candidate"; break; fi; done; fi
    if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then echo 'Node not found; set OPENCAST_NODE' >&2; exit 1; fi
    ./scripts/verify-node.sh "$NODE"
    mkdir -p "$STAGE/Contents/Resources/node/bin"
    cp -L "$NODE" "$STAGE/Contents/Resources/node/bin/node"
    codesign --force -s - --entitlements apps/macos/OpenCast.entitlements "$STAGE/Contents/Resources/node/bin/node"
fi
codesign --force --deep -s - --entitlements apps/macos/OpenCast.entitlements "$STAGE"
codesign --verify --deep --strict "$STAGE"
rm -rf "$APP"
mv "$STAGE" "$APP"
echo "Built $APP"
if [ "$OPEN_APP" = 1 ]; then open "$APP"; fi
