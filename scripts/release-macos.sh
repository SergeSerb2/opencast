#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ "$#" != 0 ]; then echo "Usage: $0" >&2; exit 2; fi
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
    echo 'Fetch the full Git history before assigning a release build number' >&2; exit 1
fi
if ! git diff --quiet HEAD || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo 'Release from a clean checkout of the source commit' >&2; exit 1
fi
REPO="${GH_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
VERSION="$(node -p 'require("./package.json").version')"
BUILD_NUMBER="$(git rev-list --count HEAD)"
REVISION="$(git rev-parse HEAD)"
TAG="v${VERSION}-build.${BUILD_NUMBER}"
NAME="OpenCast-${VERSION}-build.${BUILD_NUMBER}-arm64"
OUT="$ROOT/build/releases/$TAG"
DEFAULT_BRANCH="$(gh api "repos/$REPO" --jq .default_branch)"
STATUS="$(gh api "repos/$REPO/compare/$REVISION...$DEFAULT_BRANCH" --jq .status)"
if [ "$STATUS" != ahead ] && [ "$STATUS" != identical ]; then
    echo 'Only commits on the default branch can be released' >&2; exit 1
fi
if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    DRAFT="$(gh release view "$TAG" --repo "$REPO" --json isDraft --jq .isDraft)"
    if [ "$DRAFT" = true ]; then
        TARGET="$(gh release view "$TAG" --repo "$REPO" --json targetCommitish --jq .targetCommitish)"
        # A draft may not have created its tag yet. Check an existing tag too.
        if TAG_TARGET="$(gh api "repos/$REPO/commits/$TAG" --jq .sha 2>/dev/null)"; then
            if [ "$TAG_TARGET" != "$REVISION" ]; then echo 'Existing tag belongs to a different commit' >&2; exit 1; fi
        fi
    else
        TARGET="$(gh api "repos/$REPO/commits/$TAG" --jq .sha)"
    fi
    if [ "$TARGET" != "$REVISION" ]; then echo 'Release tag belongs to a different commit' >&2; exit 1; fi
    if [ "$DRAFT" = false ]; then
        ASSETS="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name')"
        for asset in "$NAME.dmg" "$NAME.dmg.sha256" "$NAME.json"; do
            if ! printf '%s\n' "$ASSETS" | grep -Fxq "$asset"; then
                echo "Published release is missing $asset; repair it explicitly" >&2; exit 1
            fi
        done
        echo "Release $TAG is already published for $REVISION"
        exit 0
    fi
fi
# Publishing consumes verified files; it never installs dependencies or builds.
for asset in "$NAME.dmg" "$NAME.dmg.sha256" "$NAME.json"; do
    test -s "$OUT/$asset"
done
node --input-type=module - "$OUT" "$NAME" "$VERSION" "$BUILD_NUMBER" "$REVISION" <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const [dir, name, version, build, revision] = process.argv.slice(2);
const manifest = JSON.parse(readFileSync(`${dir}/${name}.json`, 'utf8'));
assert.deepEqual(manifest, { version, build: Number(build), revision, architecture: 'arm64',
  asset: `${name}.dmg`, signing: 'ad-hoc', notarized: false, builtOn: 'macOS' });
const hash = createHash('sha256').update(readFileSync(`${dir}/${name}.dmg`)).digest('hex');
assert.equal(readFileSync(`${dir}/${name}.dmg.sha256`, 'utf8'), `${hash}  ${name}.dmg\n`);
JS
NOTES="$OUT/notes.md"
cat > "$NOTES" <<EOF
OpenCast $VERSION, build $BUILD_NUMBER, for Apple silicon Macs running macOS 14 or later.

Built on the dedicated local Mac from [$REVISION](https://github.com/$REPO/commit/$REVISION). Node is bundled. Download the DMG and drag OpenCast.app to Applications. The SHA-256 checksum and source manifest are included as separate assets.

This build is ad-hoc signed and is not notarized. If macOS blocks the app, follow [Apple's Open Anyway instructions](https://support.apple.com/guide/mac-help/mh40616/mac).
EOF
if ! gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
    gh release create "$TAG" --repo "$REPO" --target "$REVISION" --draft \
        --title "OpenCast $VERSION (build $BUILD_NUMBER)" --notes-file "$NOTES"
fi
gh release upload "$TAG" --repo "$REPO" --clobber "$OUT/$NAME.dmg" "$OUT/$NAME.dmg.sha256" "$OUT/$NAME.json"
LATEST=false
if [ "$(gh api "repos/$REPO/commits/$DEFAULT_BRANCH" --jq .sha)" = "$REVISION" ]; then LATEST=true; fi
gh release edit "$TAG" --repo "$REPO" --draft=false --latest="$LATEST"
gh release view "$TAG" --repo "$REPO" --json url --jq .url
