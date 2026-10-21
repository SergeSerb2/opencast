# Self-hosted encrypted Cloud Sync

OpenCast sync connects directly to a Cloudflare Worker and D1 database that you deploy.
It requires an account-scoped bearer token and a vault passphrase. There are no hosted
OpenCast endpoints, user accounts, credits, or paywalls.

## Threat model

The server sees the account, opaque stable record IDs, key epoch, deletion flags,
sequences, ciphertext lengths, traffic timing, device IDs/names/platform/version, and
IP/request metadata. It also sees the KDF parameters, salt, wrapped master key and vault
ID. It cannot read collections, entity IDs, titles, note contents, URLs, or settings
inside the ciphertext. Choose a device name that you are comfortable disclosing.

AES-GCM detects modifications and cross-record/cross-vault substitution. HMAC obscures
record identity. A compromised server can deny service, drop records, replay old valid
ciphertexts, manipulate sequence delivery, or attempt offline passphrase guesses against
the wrapped key. This protocol does not provide complete rollback detection or signed
multi-device history. A strong passphrase is essential. A stolen unlocked device or
trusted extension with backend access can read local plaintext and keys.

With **AI & MCP Keys** on, the vault also contains provider API keys, secret headers,
MCP environment and header secrets, and web-search keys. The server cannot read them;
it still sees record counts and ciphertext lengths, which approximate key lengths.
A passphrase compromise previously exposed notes and settings. With this option on,
it also exposes every synced API key. Use a strong, unique passphrase.
Synced keys are copied into each Mac's Keychain. Removing a device does not erase keys
already on it. If a Mac is lost, rotate the keys at each provider. A malicious server
can replay an old key ciphertext, as with any record; a stale key can fail at the provider.
The sync token, vault key, backup passphrase, extension secrets and OAuth tokens never sync.

A bearer token authorizes server access, vault replacement, device registration/removal
and wipe. Sharing a token grants administrative authority. Removing a device blocks its
HTTP requests and closes its WebSockets, but a token holder can explicitly re-register.
It cannot revoke plaintext/keys already copied by that device. Change the server token
and create a new vault/key to exclude a former token holder; export and coordinate devices
first. This is single-user/small-team self-hosting, not an enterprise identity system.

## Cryptography (format v1)

The v1 labels below retain their original bytes for compatibility with encrypted vaults.

All binary fields are canonical unpadded base64url. All strings use UTF-8. Timestamps and
server sequences are nonnegative safe JavaScript integers in milliseconds and integers,
respectively. Cryptography runs client-side using `node:crypto`; compression uses gzip.

1. Generate a 32-byte vault master key (VMK), a random UUID `vaultId`, and `keyEpoch = 1`.
2. Derive a 32-byte wrapping key with scrypt: `N = 131072`, `r = 8`, `p = 1`, a fresh
   16-byte salt, and a 256 MiB maximum memory allowance. Passphrases are used exactly as
   entered, with no Unicode normalization (1–4096 characters).
3. Wrap the VMK with AES-256-GCM and a fresh 12-byte nonce. AAD is
   `surgecast-vault-v1|<vaultId>|<keyEpoch>`. `wrapped.ct` concatenates ciphertext and
   the 16-byte authentication tag. The server vault contains only:

   ```json
   {
     "vaultId": "UUID", "keyEpoch": 1,
     "kdf": { "alg": "scrypt", "N": 131072, "r": 8, "p": 1, "salt": "base64url" },
     "wrapped": { "nonce": "base64url", "ct": "base64url" }
   }
   ```

4. Derive two 32-byte keys with HKDF-SHA256 using VMK as input and UTF-8 `vaultId` as salt:
   info `surgecast/record/v1` gives `encKey`; info `surgecast/rid/v1` gives `ridKey`.
5. `rid = base64url(HMAC-SHA256(ridKey, UTF8(collection + "\u0000" + id)))`.
   Collection/ID strings must not contain NUL.
6. Serialize `{ v: 1, collection, id, createdAt, updatedAt, deleted, data }` as JSON.
   Prefix byte `0x00` for uncompressed JSON, or `0x01` followed by gzip if the JSON
   exceeds 1024 bytes. Encrypt this entire prefixed payload with AES-256-GCM, a fresh
   12-byte nonce per write, and AAD `surgecast-record-v1|<vaultId>|<rid>|<keyEpoch>`.
   `ct` includes the 16-byte tag. Clients also verify the decrypted identity, deletion
   flag, version, bounded timestamps and gzip output size before applying it.

VMK and token are stored only through `ctx.secrets` in Keychain accounts `sync:vmk` and
`sync:token`. Passphrases are not persisted. Derived keys live in memory and are zeroed
when stopping a session. SQLite contains device ID, vault identity/epoch, cursor and
last-sync time, plus device-local sync preferences, never encryption keys or tokens.
Provider and MCP secrets and web-search keys stay in Keychain. When their category is
enabled, values pass directly between Keychain and encrypted sync records. A separate
`sync_secret_state` table stores only account names, timestamps, deletion flags, server
sequences, dirty flags and SHA-256 value hashes. Secret values never enter SQLite or
generic entity export paths. Hashes can reveal equality or allow guesses of weak values.
The generic entity store itself is local plaintext: E2EE protects the remote service,
not an unlocked local database. Fixed vectors cover HKDF/HMAC/record encryption and
scrypt/key wrapping; tests cover tampering, context substitution and compressed Unicode.

## Client behavior and conflicts

Setup first probes the server and token without creating a vault or registering a device.
An empty account asks you to create a vault with a confirmed passphrase of at least 12
characters. An existing account asks for its passphrase. Connect enforces this intent:
joining an empty account fails without creating a vault, and creating against an existing
vault asks you to join instead. It then registers a stable local device ID, stores keys
in Keychain, marks local content dirty, and pulls from cursor 0 before publishing. Wrong passphrases return `Wrong passphrase`. Existing local content
is merged; it is never deleted merely because it is absent remotely. Each cycle checks
the vault ID/epoch; a missing/replaced vault or removed device stops automatic sync.
The reason persists across restarts and appears above setup. Reconnect with the current
server credentials and passphrase. A successful connect or disconnect clears the reason.

On a connected Mac, Add Another Mac copies a setup code containing only the server URL
and access token. The format is `opencast-sync-v1:` followed by unpadded base64url of
UTF-8 JSON `{"url":"…","token":"…"}`. Paste it into setup on another Mac, then enter
the passphrase there. Share it only with your own Macs: it contains an administrative
server token and has no expiry. OpenCast marks its copies concealed and transient so
its clipboard history skips them. The code contains neither the passphrase nor vault key.

The setup form defaults Also sync AI & MCP keys to on and saves that category before
connecting. On an existing connection, enabling the category asks for confirmation.
Turning it off keeps keys on this Mac and stops syncing them; it does not remove remote
ciphertext. Extension passwords and sign-ins stay in each Mac's Keychain.

`SYNC_CATEGORIES` and `ALWAYS_SYNCED_COLLECTIONS` define the collection allowlist.
Settings are filtered individually by `SETTINGS[key].scope` and `.category`. Unknown
collections, unknown settings and device-scoped settings never sync. Clipboard history
and local runtime state are excluded. Disabling a category preserves its local data and
stops incoming/outgoing applies. Re-enabling resets the global cursor to 0, catching up
on its current remote records and tombstones; enabled dirty records still publish.

The worker uses optimistic concurrency. A null `baseSeq` means the record must not exist,
even if the current record is a tombstone. Existing records require the exact current
sequence. The client resolves conflicts by `updatedAt`, with local ties preserved, then
retries against the observed sequence. A newer remote note with different contents
preserves a dirty local note as a new note titled `<title> (Conflicted Copy)` before
applying the remote version. Remote deletion likewise preserves an unsent local note.
Title/caret-only changes do not generate content conflict copies. These are entity-level
LWW semantics, not a CRDT; clock skew can choose the wrong winner for other collections.
Observed remote timestamps advance the local monotonic clock.

Each pull page applies entities in a SQLite transaction, then awaits allowed Keychain
writes and saves their metadata. It advances the cursor last. Failed Keychain writes
leave the page available for replay. Local secret edits and sync applies share a lock,
so an edit during a native call cannot be overwritten by an earlier apply.
Push acknowledgments clear dirty flags only if the version hasn't changed locally during
the request. Changes arriving during an active cycle schedule another cycle. Triggers are application readiness,
configured `sync.intervalSeconds` (default 300; minimum 5), 2 seconds after local changes,
wake, manual `sync.now`, and authenticated WebSocket `changed` hints. Network retries use
exponential backoff from 2 seconds to 5 minutes. WebSockets reconnect with the same cap;
501 falls back to polling. A removed device requires explicit reconnect to re-register.

Disconnect leaves local content intact and optionally deletes both Keychain entries.
Remote wipe stops publication, requires explicit `confirm: "wipe"`, deletes the remote
vault/records/devices, disables this client's sync, and forgets its keys. Other devices
observe the missing/replaced vault and require reconnection. Server sequences never
reset, even across wipes, avoiding cursor reuse.

### AI & MCP Keys

This category is off by default. Turn it on separately on each Mac through the existing
category settings. It works best with **AI Commands & Presets** and **MCP Servers** on,
but their switches are independent. Turning it off stops secret push and pull and leaves
local Keychain values intact. Remote ciphertext remains; wiping Cloud Sync data removes
it. Re-enabling replays remote records to catch up.

The virtual collection is `syncedSecrets`; its record ID is the Keychain account.
Live records use `data: { v: 1, value }`; tombstones use `data: { v: 1 }` with `deleted: true`.
Both use the existing encrypted v1 envelope. Older clients skip the unknown collection.
Push collection and pull application allow only these accounts:

- `ai.provider:<id>:apiKey` and `ai.provider:<id>:header:<name>`
- `mcp:<id>:env:<name>` and `mcp:<id>:header:<name>`
- `ai.websearch:<provider>:apiKey`, for tavily, brave, exa, searxng and jina

Accounts are at most 256 characters; values are at most 64 KiB of UTF-8. Neither may
contain NUL or control characters. Header and environment names use their respective
HTTP token and environment-variable syntax. Other accounts are ignored, including
`sync:*`, `data.backup:*`, `ext:*` and `oauth:*`. Secret values never appear in status,
change events or public RPC results. The private native Keychain RPC channel carries
values between the backend and the host; it must not be captured as an application log.

Successful local sets and explicit deletes track changes even while this category is
off. After pulling, a collector compares indexed Keychain values with stored hashes
before pushing. A missing or unreadable value never creates a deletion. Deleting a
provider or MCP server explicitly deletes its local secrets; the resulting tombstones
delete peer copies on Macs with this category on. Secret conflicts use the same last
writer wins rule as entities, with dirty local ties preserved.

## HTTP API

All endpoints return JSON. Errors have `{ error, message }`. Except health, every request
requires `Authorization: Bearer <token>` and `X-OpenCast-Device: <deviceId>`. Requests
from revoked devices return 403 `device_revoked`, except explicit same-device registration.
There is no CORS/browser authentication flow. Use HTTPS; localhost HTTP is supported for
local development. Tokens never appear in URLs and redirects are refused by clients.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/v1/health` | Unauthenticated `{ ok: true, version: 1, configured: boolean }` |
| GET | `/v1/vault` | Vault JSON, or 404 `vault_not_found` |
| PUT | `/v1/vault` | Create vault (201); 409 if present. Replace with vault fields plus `replace: true` and raw `If-Match: <existing vaultId>` |
| DELETE | `/v1/vault` | Require `X-OpenCast-Confirm: wipe`; delete all account records/devices/vault; return `{ ok: true }` |
| POST | `/v1/devices` | Upsert `{ deviceId, name, platform, appVersion? }`; body ID must match header; explicit registration clears revocation; vault required |
| GET | `/v1/devices` | Array of active devices including `deviceId, name, platform, appVersion, lastSeenAt` |
| DELETE | `/v1/devices/:id` | Revoke device; return `{ ok: true }`; 404 if unknown |
| POST | `/v1/push` | `{ records: [{ rid, baseSeq, deleted, nonce, ct, keyEpoch }] }` → `{ results: [{ rid, status: "ok", seq } or { rid, status: "conflict", current }] }` |
| GET | `/v1/pull?after=0&limit=200` | `{ records, cursor, hasMore }`; records contain `rid, seq, deleted, nonce, ct, keyEpoch`, ordered by increasing sequence |
| GET | `/v1/stats` | `{ records, tombstones, bytes, devices, lastSeq }`; `records` counts live records, `bytes` is decoded ciphertext including tags |
| GET | `/v1/events` | Bearer-authenticated WebSocket, messages `{ type: "changed", seq }`; 501 if NOTIFIER absent; close 4003 on removal/wipe |

`configured` is true when `SYNC_TOKEN` or `SYNC_TOKENS` is set. It reveals no secret or
account details. Without either token secret, authenticated routes return 503
`not_configured`. `GET /` is also public and returns a short plain-text setup message.

Clients send optional raw `If-Match: <vaultId>` on push. The worker checks it inside the
D1 transaction to reject publication racing a vault replacement. A sequence allocation,
conditional insert/update, and conflict read form one transactional `D1.batch()` per
record. Gaps are allowed; batches are not all-or-nothing across different records.
Malformed entries are validated before any record commits. A lost response can result
in a conflict on retry; clients re-pull and reconcile. Notification delivery is best-effort
and polling is authoritative. D1 must use primary reads (read replication is not enabled).

`record_missing` (409) means a nonnull base sequence references a physically removed
record, usually after tombstone retention. Clients reset the cursor and retry dirty
versions against null bases after re-pulling. `vault_changed` (409) means the vault epoch
or pinned identity changed, or authorization changed during a transaction.

Change Passphrase rewraps the Keychain VMK with `wrapVault` under the **same VMK/vault
ID/epoch**, then sends PUT with `replace: true` and `If-Match: <vaultId>`. It does not
rewrite records. Other connected Macs keep working; only future joins need the new
passphrase. It does not remove anyone who holds the server token.

After changing the token on your Worker, use Update Access Token on each connected Mac.
The client probes the new credentials and checks the vault ID/epoch before saving the
token in Keychain and restarting its session. A token for a different or empty vault is
rejected. New setup codes use the updated token. The client does not expose vault key
rotation. Changing VMK/epoch requires an explicit export/new-vault/re-enrollment workflow;
old-epoch records are not automatically re-encrypted or readable with a new key.

## Deployment and recovery

See [the Worker deployment guide](../packages/sync-worker/README.md).
Its Deploy to Cloudflare button needs no terminal once the repository is public.
Generate a token in OpenCast → Settings → Cloud Sync and paste it into the button's
`SYNC_TOKEN` field. You can also generate one with `openssl rand -hex 32`.
Cloudflare creates the Worker, D1 database, and SQLite Durable Object.
The server creates its schema on first use. Applying migrations is optional and safe
before or after first use. The daily cron also initializes the schema if needed.

For a terminal deploy, run `pnpm install --frozen-lockfile`, then
`pnpm --filter @opencast/sync-worker exec wrangler login` and `./scripts/deploy-sync.sh`.
The script checks login and never starts it. It finds or creates the database, writes
an ignored local config, deploys, applies migrations, and sets a random token through stdin.
It does not edit the tracked config or save the token to a file. Existing tokens can be
kept or rotated. `--yes` accepts defaults and keeps an existing token.

New Worker and database names default to `opencast-sync`. Upgrade an existing service
with `./scripts/deploy-sync.sh --name surgecast-sync`. Add `--database <existing-name>`
if its database has another name. Confirm that the script reuses your existing database.
Keep the old Worker name to keep its URL. Keep the existing token and Durable Object
migration. For manual deploys and custom routes, follow the Worker guide.

The script checks `/v1/health` for `ok`, version 1, and `configured: true`. It prints a
setup code with the URL and token. Paste it into OpenCast → Settings → Cloud Sync.
If you keep an existing token, enter it at the hidden prompt to make a code. Otherwise,
use the URL and your existing token. Treat setup codes like passwords: they grant admin
access to the server. They do not contain your encryption passphrase.
Choose a strong passphrase separately. Each additional Mac uses the same account token
and passphrase. Separate tokens/accounts provide separate vaults. A shared team vault
shares one administrative token.

Keep the passphrase in a password manager. If you lose it and every unlocked device/key,
the cloud data is unrecoverable. If one device is still unlocked, export your local data,
then establish a new vault. Export regularly and back up D1/Worker configuration using
your Cloudflare account. Bearer-token loss can be recovered by setting a new Worker secret;
it does not recover a lost encryption key. Removing a device does not erase its local data.

## Limits and retention

- Push: maximum 200 records and 4 MiB of JSON per request. Each ciphertext is at most 1 MiB
  decoded (including its tag). Clients split by both count and encoded request bytes.
- Pull: requested limit 1–1000; server also bounds pages to approximately 4 MiB encoded,
  so fewer than requested records may be returned. `hasMore` must be followed.
- Client plaintext/inflated gzip: at most 16 MiB per record; responses at most 8 MiB.
  Records exceeding limits produce an error and remain locally dirty. Blob/attachment
  transfer is outside this implementation; local file paths do not transfer file contents.
- Synced local tombstones are purged after 30 days. Remote tombstones are collected by
  daily cron after 90 days. Devices offline or with a category disabled longer than the
  remote retention window can miss deletions and resurrect old dirty data. There is no
  permanent deleted-ID registry or device acknowledgment gate; reconnect from a current
  device/export when recovering a long-offline install.
  This also applies to deleted API keys and MCP secrets: a long-offline Mac can resurrect them.
- Cloudflare plan/storage/request limits still apply. The Worker keeps only the latest
  version of each record, not a complete history. Unlimited product features do not
  imply unlimited infrastructure capacity.

## Verification

```sh
pnpm --filter @opencast/sync-worker typecheck
pnpm --filter @opencast/sync-worker test
pnpm --filter @opencast/backend typecheck
pnpm --filter @opencast/backend test
pnpm --filter @opencast/backend build
```

Backend integration tests use two separate data directories, real entity/settings/RPC
services, an isolated in-memory Keychain stand-in, and the production Worker HTTP handler
with a SQLite D1 shim. They verify encrypted transfer, conflict copies, deletion,
category catch-up/starvation, wrong passphrases, revocation, disconnect and remote wipe.
The Worker local smoke script additionally exercises real Wrangler D1 and hibernating
Durable Objects. Production Cloudflare deployment requires your login and is separate
from local verification.

For a full process/transport check while the dedicated local Wrangler server runs:

```sh
pnpm --filter @opencast/backend build
node packages/backend/test/sync/process-smoke.mjs
```

This launches two bundled backend processes with separate SQLite directories, uses a
mock native host with per-process in-memory Keychain storage, and calls the real backend
WebSocket RPCs against the local Wrangler Worker. Synthetic entity mutations are seeded
into each store; sync verifies create, conflicted copy, delete, and secret-free logs.
It wipes only its dedicated localhost account and deletes temporary local directories.
