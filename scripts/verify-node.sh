#!/bin/bash
set -euo pipefail
if [ "$#" != 1 ]; then echo "Usage: $0 path/to/node" >&2; exit 2; fi
NODE="$1"
test -x "$NODE"
test "$(lipo -archs "$NODE")" = "$(uname -m)"
DEPENDENCIES="$(otool -L "$NODE")"
while IFS= read -r dependency; do
    case "$dependency" in
        /usr/lib/*|/System/Library/*) ;;
        *) echo "Node has a non-system dependency: $dependency" >&2; exit 1 ;;
    esac
done < <(printf '%s\n' "$DEPENDENCIES" | awk 'NR > 1 { print $1 }')
"$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<13))process.exit(1)'
