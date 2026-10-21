# OpenCast self-hosted sync

This MIT-licensed Worker stores only encrypted records. You own the Cloudflare account,
D1 database, bearer tokens, and vault passphrase. No OpenCast account or service is used.

## Deploy

### Option 1: Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SergeSerb2/opencast/tree/main/packages/sync-worker)

The button works once this repository is public. You need Cloudflare and GitHub accounts.
No terminal is required. Cloudflare copies this directory into your GitHub account and
creates the Worker, D1 database, and SQLite Durable Object.

1. In OpenCast → Settings → Cloud Sync, generate a long random access token.
   You can also generate one in a terminal with `openssl rand -hex 32`.
2. Click the button. Accept the default names or choose your own.
3. Paste the token into the `SYNC_TOKEN` secret field. Keep it in a password manager.
4. Deploy. Open the returned HTTPS URL to check that the server is running.
5. Paste the URL and the same token into OpenCast → Settings → Cloud Sync.
   Choose a strong encryption passphrase. Use the same passphrase on each Mac.

The access token grants admin access to the server. It is separate from the encryption
passphrase. The server creates its schema on first use, including from the daily cron.
No migration command is needed for first use. The SQL in `migrations/0001_init.sql` is
shared by the Worker and Wrangler. It is safe to apply before or after first use.

See [Cloudflare's button guide](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

### Option 2: Terminal helper

Install Node 22.23+ and pnpm. Clone the repository, then run these commands from its root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @opencast/sync-worker exec wrangler login
./scripts/deploy-sync.sh
```

The script checks `wrangler whoami` before any remote change. It never starts a login
flow. Confirm the Worker and database names. The defaults are both `opencast-sync`.
The script finds an existing D1 database by name or offers to create it. It saves the ID
in the ignored `packages/sync-worker/wrangler.local.toml`. It never edits the tracked
`wrangler.toml`. Relative source and migration paths stay valid.

The script deploys, applies remote migrations as an extra check, and creates a random
32-byte access token. It sends the token to Wrangler through stdin. It does not save the
token to a file. If `SYNC_TOKEN` already exists, choose to keep it or rotate it. Rotation
requires each device to use the new token. Other secrets, including `SYNC_TOKENS`, stay active.

The script checks `/v1/health` for `ok: true`, `version: 1`, and `configured: true`.
It prints a SETUP CODE for OpenCast and offers to copy it with `pbcopy` on macOS.
The format is `opencast-sync-v1:` plus unpadded base64url of UTF-8 JSON with `url` and
`token` fields. Treat the code like a password. It contains the admin access token,
not the encryption passphrase.

When keeping a token, enter its value at the hidden prompt to include it in a setup code.
Cloudflare cannot return an existing secret. If you skip this prompt, use the URL and
your existing token in the app. `--yes` accepts defaults without a terminal and keeps
an existing token. It cannot print a setup code for a kept token whose value it does not know.

```sh
./scripts/deploy-sync.sh --name my-opencast-sync --database my-sync-data
./scripts/deploy-sync.sh --yes
```

### Option 3: Manual Wrangler commands

From `packages/sync-worker` in the full repository, or from a copy of just this directory:

```sh
npm install
npx wrangler login
npx wrangler whoami
cp wrangler.toml wrangler.local.toml
npx wrangler deploy -c wrangler.local.toml
npx wrangler secret put SYNC_TOKEN -c wrangler.local.toml
```

Generate a token in OpenCast or with `openssl rand -hex 32`. Paste it at Wrangler's
secret prompt. Wrangler 4 provisions D1 on the first deploy because `database_id` is
absent. Keep the linked ID in your local config for later deploys. Do not commit it.
The `v1` Durable Object migration and daily cron stay in the config.

Open the deployed URL. `/` shows a short setup message. `/v1/health` returns
`{ "ok": true, "version": 1, "configured": true }` once a token secret is set.
Without a token, `configured` is false and authenticated endpoints return 503
`not_configured`. Neither public endpoint returns tokens or account details.

You can also record Wrangler's migration history after the deploy. This is optional:

```sh
npx wrangler d1 migrations apply DB --remote -c wrangler.local.toml
```

### Upgrading an existing surgecast-sync deployment

Keep the old Worker name and database. The OpenCast rename does not require new resources.
From the full repository root, run:

```sh
./scripts/deploy-sync.sh --name surgecast-sync
# If the existing database has a different name:
./scripts/deploy-sync.sh --name surgecast-sync --database your-existing-database
```

The script looks up that database by name and reuses its ID. Check that it says
`Reusing D1 database` before deployment. Stop at the create prompt if you expected an
existing database. Keep the existing token when asked. The Worker name keeps the
workers.dev URL stable. Existing data and Wrangler's `d1_migrations` table stay intact.
The schema setup uses `IF NOT EXISTS` and does not change existing tables or indexes.

For manual upgrades, copy the template to `wrangler.local.toml`. Set `name` to
`surgecast-sync`. Set `database_name` to the existing database name and add its
`database_id` from `npx wrangler d1 list --json -c wrangler.local.toml`.
Preserve any custom routes and settings from your existing config. Keep the NOTIFIER
binding and its `v1` SQLite class migration. Deploy with
`npx wrangler deploy -c wrangler.local.toml --keep-vars`. Do not create a replacement
D1 database or use the button to upgrade an existing service.

For separate vaults, set `SYNC_TOKENS` to `account:token,account2:token2` instead.
Names and tokens must not contain commas. Account names must not contain colons.
Both secret variables, if set, remain active. Remove unused secrets with
`wrangler secret delete`. Accounts are isolated by the authenticated token.
A small team sharing one vault shares its account token and passphrase.

`NOTIFIER` provides WebSocket change hints. For a new polling-only deployment, remove
the `durable_objects.bindings` and `migrations` blocks before the first deploy.
`/v1/events` then returns 501 and clients poll. Keep existing class migrations on upgrades.

## Local verification

```sh
pnpm --filter @opencast/sync-worker typecheck
pnpm --filter @opencast/sync-worker test
pnpm --filter @opencast/sync-worker exec wrangler dev --local --port 18787 --var SYNC_TOKEN:local-test --persist-to /tmp/opencast-sync-local
# In another terminal; uses and wipes ONLY the dedicated localhost account:
node packages/sync-worker/test/local-smoke.mjs
```

Existing tests start with empty databases and run the shared schema SQL against a
SQLite D1 shim. The local smoke script exercises real D1/DO behavior: health, vault creation, conflicts, pagination,
tombstones, stats, WebSocket notification, device revocation/re-registration, and wipe.
It refuses remote URLs. Never use production credentials for tests.

Daily cron removes tombstones older than 90 days. Local scheduled events can be triggered
at `http://127.0.0.1:18787/cdn-cgi/local/scheduled` while Wrangler runs. Worker code never
logs tokens, encrypted payloads, SQL exceptions or clear user content. Cloudflare request
metadata remains subject to your account's logging settings.

See [docs/SYNC.md](https://github.com/SergeSerb2/opencast/blob/main/docs/SYNC.md) for crypto, APIs, recovery, and limitations.
