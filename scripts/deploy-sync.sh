#!/usr/bin/env bash
# Do not trace tokens, even if the caller starts this script with bash -x.
set +x
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'TEXT'
Usage: ./scripts/deploy-sync.sh [--name <worker-name>] [--database <name>] [--yes]

Defaults: Worker opencast-sync; D1 uses the Worker name.
--yes accepts defaults without a terminal. It keeps an existing SYNC_TOKEN.
Log in first: pnpm --filter @opencast/sync-worker exec wrangler login
TEXT
}
fail() { echo "$*" >&2; exit 1; }
worker_name=opencast-sync
database_name=
accept_defaults=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name|--database)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "Missing value for $1"
      if [[ "$1" == --name ]]; then worker_name=$2; else database_name=$2; fi
      shift 2 ;;
    --yes) accept_defaults=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; fail "Unknown option: $1" ;;
  esac
done
database_name=${database_name:-$worker_name}
[[ "$worker_name" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ && ${#worker_name} -le 63 ]] || fail "Use a Worker name of up to 63 lowercase letters, digits, or hyphens."
[[ "$database_name" =~ ^[a-zA-Z0-9_-]+$ ]] || fail "Use only letters, digits, hyphens, or underscores in the database name."
if ! $accept_defaults && [[ ! -t 0 ]]; then
  fail "Run this script in an interactive terminal, or use --yes. Log in first:
  pnpm --filter @opencast/sync-worker exec wrangler login"
fi
for dependency in pnpm node curl; do
  command -v "$dependency" >/dev/null || fail "Install $dependency before running this script."
done
confirm() {
  if $accept_defaults; then return 0; fi
  local answer
  read -r -p "$1 [Y/n]: " answer
  [[ -z "$answer" || "$answer" == y || "$answer" == Y || "$answer" == yes ]]
}

# Keep relative entry point and migration paths next to the tracked template.
config=packages/sync-worker/wrangler.local.toml
node --input-type=module - "$worker_name" "$database_name" "$config" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [name, database, path] = process.argv.slice(2);
const source = readFileSync("packages/sync-worker/wrangler.toml", "utf8");
const config = source.replace(/^name = .*$/m, `name = "${name}"`)
  .replace(/^database_name = .*$/m, `database_name = "${database}"`)
  .replace(/^database_id = .*\n/gm, "");
writeFileSync(path, config);
JS
# pnpm exec starts in the package directory. Use an absolute config path.
config="$PWD/$config"
wrangler() { pnpm --filter @opencast/sync-worker exec wrangler -c "$config" "$@"; }

# whoami --json is read-only and exits nonzero when not authenticated.
if ! identity=$(wrangler whoami --json) || ! printf '%s' "$identity" | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
if (JSON.parse(input).loggedIn !== true) process.exit(1);
'; then
  fail "Cloudflare login is required. No remote changes were made. Run:
  pnpm --filter @opencast/sync-worker exec wrangler login"
fi
echo "Worker: $worker_name; D1 database: $database_name"
echo "Local config: $config (the tracked template stays unchanged)."
confirm "Deploy this Worker and use this database?" || exit 0

database_id_from_list() {
  node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const matches = JSON.parse(input).filter(db => db.name === process.argv[1]);
if (matches.length > 1) throw new Error("More than one database has this name");
if (matches[0]) console.log(matches[0].uuid);
' "$database_name"
}
database_id=$(wrangler d1 list --json | database_id_from_list)
if [[ -z "$database_id" ]]; then
  confirm "Create D1 database $database_name?" || exit 0
  wrangler d1 create "$database_name" --no-update-config
  database_id=$(wrangler d1 list --json | database_id_from_list)
else
  echo "Reusing D1 database $database_name."
fi
[[ "$database_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || fail "Could not find a valid D1 database ID."
node --input-type=module - "$config" "$database_id" <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const [path, id] = process.argv.slice(2);
writeFileSync(path, readFileSync(path, "utf8").replace(/^(database_name = .*)$/m, `$1\ndatabase_id = "${id}"`));
JS

if ! deployed=$(wrangler deploy --keep-vars 2>&1); then
  printf '%s\n' "$deployed" >&2
  fail "Deployment failed."
fi
printf '%s\n' "$deployed"
url=$(printf '%s' "$deployed" | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const output = input.replace(/\x1b\[[0-9;]*m/g, "");
// Only deployment targets, not documentation links in warnings or the banner.
const targets = output.split(/Deployed .+ triggers[^\n]*\n/).at(-1);
if (targets === output) process.exit(1);
for (const line of targets.split("\n")) {
  const match = line.match(/^\s+(https:\/\/[^\s]+\.workers\.dev)\s*$/)
    ?? line.match(/^\s+(?:https:\/\/)?([a-zA-Z0-9.-]+)(?:\/)?\s+\(custom domain[^)]*\)\s*$/);
  if (!match) continue;
  const url = new URL(match[1].startsWith("https://") ? match[1] : "https://" + match[1]);
  if (url.protocol !== "https:" || url.username || url.password) process.exit(1);
  console.log(url.origin); process.exit(0);
}
process.exit(1);
') || fail "Could not find the deployed HTTPS URL. Check the deployment targets above."

# Optional for first use; also records the migration in Wrangler's history.
wrangler d1 migrations apply DB --remote

existing=$(wrangler secret list --format json)
has_token=$(printf '%s' "$existing" | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
console.log(JSON.parse(input).some(secret => secret.name === "SYNC_TOKEN"));
')
token=
rotate=true
if [[ "$has_token" == true ]]; then
  if confirm "SYNC_TOKEN already exists. Keep it? (Choose n to rotate it)"; then
    rotate=false
    echo "Keep using your existing token. Cloudflare cannot return its value."
    if ! $accept_defaults; then
      read -r -s -p "Existing token for the setup code (Enter to skip): " token
      echo
    fi
  else
    confirm "Rotate SYNC_TOKEN? Devices must use the new token." || exit 0
  fi
fi
if $rotate; then
  token=$(node --input-type=module -e 'import { randomBytes } from "node:crypto"; process.stdout.write(randomBytes(32).toString("hex"));')
  # The token stays in shell memory and stdin, never an argument or a file.
  printf '%s' "$token" | wrangler secret put SYNC_TOKEN
fi

# New deployments and secret changes can take a short time to reach the edge.
healthy=false
for attempt in 1 2 3 4 5 6; do
  if health=$(curl --fail --silent --show-error --connect-timeout 5 --max-time 10 "$url/v1/health") &&
    printf '%s' "$health" | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
try { const h = JSON.parse(input); process.exit(h.ok === true && h.version === 1 && h.configured === true ? 0 : 1); }
catch { process.exit(1); }
'; then
    healthy=true
    break
  fi
  if [[ "$attempt" != 6 ]]; then sleep 2; fi
done
if $healthy; then
  echo "Health check passed: ok=true, version=1, configured=true."
else
  echo "Health check failed for $url/v1/health. Check the Worker in Cloudflare before connecting." >&2
fi
echo "Server URL: $url"
if [[ -n "$token" ]]; then
  setup_code=$(printf '%s' "$token" | node --input-type=module -e '
let token = ""; for await (const chunk of process.stdin) token += chunk;
process.stdout.write("opencast-sync-v1:" + Buffer.from(JSON.stringify({ url: process.argv[1], token }), "utf8").toString("base64url"));
' "$url")
  echo "SETUP CODE (paste into OpenCast → Settings → Cloud Sync):"
  printf '%s\n' "$setup_code"
  echo "This code contains the access token. It grants admin access to this server."
  echo "Treat it like a password. It does not contain your encryption passphrase."
  if ! $accept_defaults && command -v pbcopy >/dev/null && confirm "Copy the setup code to the clipboard?"; then
    printf '%s' "$setup_code" | pbcopy
    echo "Setup code copied. If OpenCast is running, its Clipboard History keeps a copy on this Mac;"
    echo "delete that entry after you paste the code."
  fi
else
  echo "No setup code was generated because the existing token was kept and not entered."
  echo "Use the server URL with your existing token, or rerun this script and choose rotation."
fi
unset token setup_code
$healthy
