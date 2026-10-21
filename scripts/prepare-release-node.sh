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
test -s "$STAGE/$NAME/LICENSE"
"$ROOT/scripts/verify-node.sh" "$STAGE/$NAME/bin/node"
# Record the verified archive's binary/license pair before signing the app copy.
"$STAGE/$NAME/bin/node" --input-type=module - "$STAGE/$NAME" "$VERSION" "$SHA256" <<'JS'
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [dir, version, archiveSHA256] = process.argv.slice(2);
const hash = file => createHash('sha256').update(readFileSync(`${dir}/${file}`)).digest('hex');
writeFileSync(`${dir}/opencast-node.json`, JSON.stringify({ version, archiveSHA256,
  binarySHA256: hash('bin/node'), licenseSHA256: hash('LICENSE'),
  source: `https://nodejs.org/dist/v${version}/node-v${version}-darwin-${process.arch}.tar.gz` }, null, 2) + '\n');
JS
# Keep the package manager bootstrap under the same integrity boundary.
curl --fail --location --proto '=https' --tlsv1.2 \
    https://registry.npmjs.org/pnpm/-/pnpm-10.18.0.tgz -o "$STAGE/pnpm.tgz"
test "$(shasum -a 256 "$STAGE/pnpm.tgz" | awk '{print $1}')" = 3967a3efe2909df305fec4b833a304dfca17c380b6bb77672f4dac4f2cdd3788
"$STAGE/$NAME/bin/node" -e 'if(require(process.argv[1]).packageManager!=="pnpm@10.18.0")process.exit(1)' "$ROOT/package.json"
mkdir -p "$STAGE/$NAME/share/pnpm"
tar -xzf "$STAGE/pnpm.tgz" --strip-components 1 -C "$STAGE/$NAME/share/pnpm"
ln -s ../share/pnpm/bin/pnpm.cjs "$STAGE/$NAME/bin/pnpm"
rm -rf "$ROOT/build/$NAME"
mv "$STAGE/$NAME" "$ROOT/build/$NAME"
printf '%s\n' "$ROOT/build/$NAME/bin/node"
