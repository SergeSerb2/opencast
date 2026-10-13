#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$#" != 0 ]; then echo "Usage: $0" >&2; exit 2; fi
# Official standalone Node distribution. Update its version and checksums together.
VERSION=22.23.1
case "$(uname -m)" in
    arm64) ARCH=arm64; SHA256=ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953 ;;
    x86_64) ARCH=x64; SHA256=b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81 ;;
    *) echo 'Unsupported Mac architecture' >&2; exit 1 ;;
esac
NAME="node-v$VERSION-darwin-$ARCH"
mkdir -p "$ROOT/build"
STAGE="$(mktemp -d "$ROOT/build/.release-node.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
curl --fail --location --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/v$VERSION/$NAME.tar.gz" -o "$STAGE/$NAME.tar.gz"
test "$(shasum -a 256 "$STAGE/$NAME.tar.gz" | awk '{print $1}')" = "$SHA256"
tar -xzf "$STAGE/$NAME.tar.gz" -C "$STAGE"
"$ROOT/scripts/verify-node.sh" "$STAGE/$NAME/bin/node"
rm -rf "$ROOT/build/$NAME"
mv "$STAGE/$NAME" "$ROOT/build/$NAME"
printf '%s\n' "$ROOT/build/$NAME/bin/node"
