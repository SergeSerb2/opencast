#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ "$#" != 0 ]; then echo "Usage: $0" >&2; exit 2; fi
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
    echo 'Release typechecks currently require the Apple silicon build Mac' >&2; exit 1
fi
# Verify both the launcher and its only native dependency before extraction or
# execution. No install scripts, registry resolution, or project dependency edits.
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/opencast-compiler.XXXXXX")"
trap 'rm -rf "$TEMP"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 \
    https://registry.npmjs.org/tsc-rs/-/tsc-rs-0.5.0.tgz -o "$TEMP/compiler.tgz"
curl --fail --location --proto '=https' --tlsv1.2 \
    https://registry.npmjs.org/@tsc-rs/darwin-arm64/-/darwin-arm64-0.5.0.tgz -o "$TEMP/native.tgz"
test "$(shasum -a 256 "$TEMP/compiler.tgz" | awk '{print $1}')" = 77e350cffcb82a709683808d472da7b99d544c4938ac92f247b6ca287df75572
test "$(shasum -a 256 "$TEMP/native.tgz" | awk '{print $1}')" = 6eee8a267930db2f092814f009f3aab46028cc91e40f3d32bd6c4d268ebb540b
TOOL="$TEMP/node_modules/tsc-rs"
NATIVE="$TEMP/node_modules/@tsc-rs/darwin-arm64"
mkdir -p "$TOOL" "$NATIVE"
tar -xzf "$TEMP/compiler.tgz" --strip-components 1 -C "$TOOL"
tar -xzf "$TEMP/native.tgz" --strip-components 1 -C "$NATIVE"
for package in protocol frontend backend raycast-api; do
    pnpm exec "$TOOL/bin/tsc-rs" --noEmit -p "packages/$package/tsconfig.json"
done
