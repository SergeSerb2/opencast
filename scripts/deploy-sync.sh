#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
wrangler() { pnpm --filter @surgecast/sync-worker exec wrangler "$@"; }
if [[ ! -t 0 ]]; then
  echo "Run this script in an interactive terminal. First log in:"
  echo "  pnpm --filter @surgecast/sync-worker exec wrangler login"
  exit 1
fi
# whoami is read-only. No Cloudflare mutation happens before a verified login.
if ! identity=$(wrangler whoami 2>&1) || [[ "$identity" == *"not authenticated"* || "$identity" == *"not logged in"* ]]; then
  echo "Cloudflare login is required. Run:"
  echo "  pnpm --filter @surgecast/sync-worker exec wrangler login"
  exit 1
fi
read -r -p "D1 database name [surgecast-sync]: " database_name
database_name=${database_name:-surgecast-sync}
if [[ ! "$database_name" =~ ^[a-zA-Z0-9_-]+$ ]]; then echo "Invalid database name"; exit 1; fi
read -r -p "Create this database? [y/N] (choose N to use an existing one): " create_database
if [[ "$create_database" == "y" || "$create_database" == "Y" ]]; then wrangler d1 create "$database_name"; fi
read -r -p "D1 database UUID (from create output or Cloudflare dashboard): " database_id
if [[ ! "$database_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then echo "Invalid database UUID"; exit 1; fi
node --input-type=module - "$database_name" "$database_id" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const path = "packages/sync-worker/wrangler.toml";
const [name, id] = process.argv.slice(2);
const config = readFileSync(path, "utf8");
writeFileSync(path, config.replace(/^database_name = .*$/m, `database_name = "${name}"`).replace(/^database_id = .*$/m, `database_id = "${id}"`));
JS
read -r -p "Apply migrations to the REMOTE database $database_name? [y/N]: " migrate
if [[ "$migrate" != "y" && "$migrate" != "Y" ]]; then echo "Stopped before remote changes."; exit 0; fi
wrangler d1 migrations apply "$database_name" --remote
read -r -p "Auth mode: single token or account:token pairs? [single/pairs]: " mode
if [[ "$mode" == "pairs" ]]; then
  echo "Paste account:token,account2:token2 at the Wrangler secret prompt. Use long random tokens."
  wrangler secret put SYNC_TOKENS
else
  echo "Paste a long random token at the Wrangler secret prompt. It will not be saved to a file."
  wrangler secret put SYNC_TOKEN
fi
read -r -p "Deploy the Worker now? [y/N]: " deploy
if [[ "$deploy" != "y" && "$deploy" != "Y" ]]; then echo "Configuration ready; deployment skipped."; exit 0; fi
wrangler deploy
cat <<'TEXT'
Copy the Worker HTTPS URL into Surgecast Cloud Sync settings with your token and a strong passphrase.
Keep the passphrase safe: losing it and all unlocked devices makes the encrypted data unrecoverable.
TEXT
