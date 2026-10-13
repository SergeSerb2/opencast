# OpenCast self-hosted sync

This MIT-licensed Worker stores only encrypted records. You own the Cloudflare account,
D1 database, bearer tokens, and vault passphrase. No OpenCast account or service is used.

## Deploy

Requirements: Node 22.23+, pnpm, a Cloudflare account with Workers and D1 enabled.
From the repository root:

```sh
pnpm --filter @opencast/sync-worker exec wrangler login
./scripts/deploy-sync.sh
```

The interactive script checks your login before remote mutations, optionally creates the
D1 database, saves its ID to `wrangler.toml`, applies migrations, prompts for a secret,
and deploys. Review the prompts before proceeding. It does not store your token locally.

Manual steps:

```sh
pnpm --filter @opencast/sync-worker exec wrangler whoami
pnpm --filter @opencast/sync-worker exec wrangler d1 create opencast-sync
# Set database_id in packages/sync-worker/wrangler.toml to the printed UUID.
pnpm --filter @opencast/sync-worker exec wrangler d1 migrations apply opencast-sync --remote
pnpm --filter @opencast/sync-worker exec wrangler secret put SYNC_TOKEN
pnpm --filter @opencast/sync-worker deploy
```

Generate at least 32 random bytes for a token (for example with `openssl rand -hex 32`).
For separate vaults use `SYNC_TOKENS` instead: `account:token,account2:token2`.
Names/tokens must not contain commas; account names must not contain colons. Both secret
variables, if set, remain active: remove any unused secret with `wrangler secret delete`.
Accounts are isolated by the authenticated token, never by a client-selected account ID.
A small team sharing one vault shares its account token and passphrase.

`NOTIFIER` enables hibernating WebSocket hints using a SQLite Durable Object migration.
For polling-only deployments remove the `durable_objects.bindings` and `migrations`
blocks before the first deployment. `/v1/events` then returns 501; clients poll normally.
Never remove an existing class migration casually from an already deployed Worker.

## Local verification

```sh
pnpm --filter @opencast/sync-worker typecheck
pnpm --filter @opencast/sync-worker test
pnpm --filter @opencast/sync-worker exec wrangler d1 migrations apply opencast-sync --local
pnpm --filter @opencast/sync-worker exec wrangler dev --local --port 18787 --var SYNC_TOKEN:local-test
# In another terminal; uses and wipes ONLY the dedicated localhost account:
node packages/sync-worker/test/local-smoke.mjs
```

Unit tests execute production SQL against an in-memory SQLite D1 shim. The local smoke
script exercises real D1/DO behavior: health, vault creation, conflicts, pagination,
tombstones, stats, WebSocket notification, device revocation/re-registration, and wipe.
It refuses remote URLs. Never use production credentials for tests.

Daily cron removes tombstones older than 90 days. Local scheduled events can be triggered
at `http://127.0.0.1:18787/cdn-cgi/local/scheduled` while Wrangler runs. Worker code never
logs tokens, encrypted payloads, SQL exceptions or clear user content. Cloudflare request
metadata remains subject to your account's logging settings.

See [docs/SYNC.md](../../docs/SYNC.md) for crypto, APIs, recovery, and limitations.
