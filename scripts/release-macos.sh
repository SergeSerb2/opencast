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
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/opencast-publish.XXXXXX")"
trap 'rm -rf "$TEMP"' EXIT
# Resolve the exact tag ref, including annotated tags. A failed API request must
# not be mistaken for an absent tag unless GitHub explicitly returns 404.
check_tag() {
    TAG_TARGET=''
    if TAG_OBJECT="$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq '.object | [.type, .sha] | @tsv' 2>"$TEMP/tag-error")"; then
        read -r TAG_TYPE TAG_TARGET <<< "$TAG_OBJECT"
        for depth in {1..10}; do
            if [ "$TAG_TYPE" = commit ]; then break; fi
            if [ "$TAG_TYPE" != tag ]; then echo 'Unexpected tag object type' >&2; exit 1; fi
            TAG_OBJECT="$(gh api "repos/$REPO/git/tags/$TAG_TARGET" --jq '.object | [.type, .sha] | @tsv')"
            read -r TAG_TYPE TAG_TARGET <<< "$TAG_OBJECT"
        done
        if [ "$TAG_TYPE" != commit ] || [ "$TAG_TARGET" != "$REVISION" ]; then
            echo 'Existing tag belongs to a different commit' >&2; exit 1
        fi
    elif ! grep -Fq '(HTTP 404)' "$TEMP/tag-error"; then
        cat "$TEMP/tag-error" >&2
        exit 1
    fi
}
check_tag
read_release_metadata() {
    RELEASE_EXISTS=1
    METADATA="$(node --input-type=module - "$TEMP/release.json" "$TAG" <<'JS'
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert(Number.isSafeInteger(r.id) && r.id > 0);
assert.equal(r.tag_name, process.argv[3]);
assert.equal(typeof r.draft, 'boolean');
assert.equal(typeof r.target_commitish, 'string');
assert(r.assets.every(name => typeof name === 'string'));
console.log(`${r.id}\t${r.draft}\t${r.target_commitish}`);
JS
)"
    read -r RELEASE_ID DRAFT TARGET <<< "$METADATA"
    ASSETS="$(node -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).assets.join("\n")' "$TEMP/release.json")"
}
load_release() {
    # The by-tag endpoint returns published releases only. List releases with
    # write access to include drafts, and fail closed on any pagination error.
    gh api "repos/$REPO/releases?per_page=100" --paginate --slurp >"$TEMP/releases.json"
    RELEASE_EXISTS="$(node --input-type=module - "$TEMP/releases.json" "$TAG" "$TEMP/release.json" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const [list, tag, output] = process.argv.slice(2);
const pages = JSON.parse(readFileSync(list, 'utf8'));
assert(Array.isArray(pages) && pages.every(Array.isArray), 'Invalid paginated release list');
const matches = pages.flat().filter(r => r.tag_name === tag);
assert(matches.length <= 1, 'Multiple releases use the same tag');
if (matches.length) {
  const r = matches[0];
  writeFileSync(output, JSON.stringify({ id: r.id, draft: r.draft, tag_name: r.tag_name,
    target_commitish: r.target_commitish, assets: r.assets.map(a => a.name) }));
}
console.log(matches.length);
JS
)"
    if [ "$RELEASE_EXISTS" = 1 ]; then
        read_release_metadata
    fi
}
check_draft() {
    # A newly created draft can lag in the release list. Its returned ID is
    # authoritative; use the direct endpoint for all subsequent state checks.
    gh api "repos/$REPO/releases/$EXPECTED_RELEASE_ID" \
        --jq '{id, draft, tag_name, target_commitish, assets: [.assets[].name]}' >"$TEMP/release.json"
    read_release_metadata
    if [ "$RELEASE_EXISTS" != 1 ] || [ "$RELEASE_ID" != "$EXPECTED_RELEASE_ID" ] || \
        [ "$DRAFT" != true ] || [ "$TARGET" != "$REVISION" ]; then
        echo 'Release is no longer the expected source draft' >&2; exit 1
    fi
    check_tag
    test "$TAG_TARGET" = "$REVISION"
}
# Publishing consumes verified files; it never installs dependencies or builds.
verify_assets() {
    node --input-type=module - "$1" "$NAME" "$VERSION" "$BUILD_NUMBER" "$REVISION" <<'JS'
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
}
verify_assets "$OUT"
load_release
if [ "$RELEASE_EXISTS" = 1 ]; then
    if [ "$DRAFT" = false ]; then
        TARGET="$TAG_TARGET"
    fi
    if [ "$TARGET" != "$REVISION" ]; then echo 'Release tag belongs to a different commit' >&2; exit 1; fi
    if [ "$DRAFT" = false ]; then
        for asset in "$NAME.dmg" "$NAME.dmg.sha256" "$NAME.json"; do
            if ! printf '%s\n' "$ASSETS" | grep -Fxq "$asset"; then
                echo "Published release is missing $asset; repair it explicitly" >&2; exit 1
            fi
        done
        mkdir "$TEMP/published"
        gh release download "$TAG" --repo "$REPO" --dir "$TEMP/published" \
            --pattern "$NAME.dmg" --pattern "$NAME.dmg.sha256" --pattern "$NAME.json"
        verify_assets "$TEMP/published"
        for asset in "$NAME.dmg" "$NAME.dmg.sha256" "$NAME.json"; do
            if ! cmp -s "$OUT/$asset" "$TEMP/published/$asset"; then
                echo "Published $asset differs from the verified artifact; repair it explicitly" >&2; exit 1
            fi
        done
        echo "Release $TAG is already published for $REVISION"
        exit 0
    fi
fi
NOTES="$OUT/notes.md"
cat > "$NOTES" <<EOF
OpenCast $VERSION, build $BUILD_NUMBER, for Apple silicon Macs running macOS 14 or later.

Built on the dedicated local Mac from [$REVISION](https://github.com/$REPO/commit/$REVISION). Node is bundled. Download the DMG and drag OpenCast.app to Applications. The SHA-256 checksum and source manifest are included as separate assets.

This build is ad-hoc signed and is not notarized. If macOS blocks the app, follow [Apple's Open Anyway instructions](https://support.apple.com/guide/mac-help/mh40616/mac).
EOF
if [ -z "$TAG_TARGET" ]; then
    # Atomic ref creation fails if another writer creates the tag first.
    gh api "repos/$REPO/git/refs" --method POST -f "ref=refs/tags/$TAG" -f "sha=$REVISION" >/dev/null
fi
if [ "$RELEASE_EXISTS" = 0 ]; then
    gh api "repos/$REPO/releases" --method POST -f "tag_name=$TAG" \
        -f "target_commitish=$REVISION" -F draft=true \
        -f "name=OpenCast $VERSION (build $BUILD_NUMBER)" -F "body=@$NOTES" \
        --jq '{id, draft, tag_name, target_commitish, assets: [.assets[].name]}' >"$TEMP/release.json"
    read_release_metadata
fi
EXPECTED_RELEASE_ID="$RELEASE_ID"
check_draft
mkdir "$TEMP/draft"
for asset in "$NAME.dmg" "$NAME.dmg.sha256" "$NAME.json"; do
    if printf '%s\n' "$ASSETS" | grep -Fxq "$asset"; then
        gh release download "$TAG" --repo "$REPO" --dir "$TEMP/draft" --pattern "$asset"
        if ! cmp -s "$OUT/$asset" "$TEMP/draft/$asset"; then
            echo "Draft $asset differs from the verified artifact; repair it explicitly" >&2; exit 1
        fi
    else
        # Upload to the known release ID instead of rediscovering the new draft
        # through a tag lookup. Existing assets are never overwritten.
        gh api "https://uploads.github.com/repos/$REPO/releases/$EXPECTED_RELEASE_ID/assets?name=$asset" \
            --method POST -H 'Content-Type: application/octet-stream' --input "$OUT/$asset" >/dev/null
    fi
done
LATEST=false
if [ "$(gh api "repos/$REPO/commits/$DEFAULT_BRANCH" --jq .sha)" = "$REVISION" ]; then LATEST=true; fi
check_draft
gh api "repos/$REPO/releases/$EXPECTED_RELEASE_ID" --method PATCH \
    -f "tag_name=$TAG" -f "target_commitish=$REVISION" -F draft=false -f "make_latest=$LATEST" --jq .html_url
