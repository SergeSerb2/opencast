#!/usr/bin/env bash
# Browser development: runs the backend without the Swift host (macOS CLI fallbacks for
# native features) and the Vite dev server pointed at it.
#   ./scripts/dev.sh            → http://localhost:5173/main.html
#   ./scripts/dev.sh --mock     → frontend only, in-browser mock backend
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${OPENCAST_PORT:-${SURGECAST_PORT:-47800}}"
TOKEN="${OPENCAST_TOKEN:-${SURGECAST_TOKEN:-dev}}"
DATA_DIR="${OPENCAST_DATA_DIR:-${SURGECAST_DATA_DIR:-}}"
if [ -z "$DATA_DIR" ]; then
  DATA_DIR="$HOME/Library/Application Support/OpenCast-Dev"
  if [ ! -d "$DATA_DIR" ] && [ -d "$HOME/Library/Application Support/Surgecast-Dev" ]; then
    DATA_DIR="$HOME/Library/Application Support/Surgecast-Dev"
  fi
fi

[ -d node_modules ] || pnpm install

if [ "${1:-}" = "--mock" ]; then
  echo "Open http://localhost:5173/main.html?mock=1"
  exec pnpm --filter @opencast/frontend dev
fi

pnpm --filter @opencast/raycast-api build >/dev/null 2>&1 || echo "warning: extension runtime build failed"
pnpm --filter @opencast/backend build
node packages/backend/dist/index.mjs --no-native --dev --data-dir "$DATA_DIR" --port "$PORT" --token "$TOKEN" &
BACKEND_PID=$!
trap 'kill $BACKEND_PID 2>/dev/null || true' EXIT

echo "Backend on ws://127.0.0.1:$PORT/rpc (token $TOKEN)"
echo "Open http://localhost:5173/main.html?backend=ws://127.0.0.1:$PORT/rpc&token=$TOKEN"
pnpm --filter @opencast/frontend dev
