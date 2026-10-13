import type { D1Database, DurableObjectNamespace } from "@cloudflare/workers-types";
import { SYNC_MAX_RECORDS, SYNC_MAX_REQUEST_BYTES, type SyncWireRecord, type SyncPushResult } from "../../protocol/src/sync";
import { authenticate, type AuthEnvironment } from "./auth";
import { HttpError, invalid, integer, object, pushRecord, text, vault } from "./validation";

export interface Env extends AuthEnvironment { DB: D1Database; NOTIFIER?: DurableObjectNamespace }
interface Row { rid: string; seq: number; deleted: number; nonce: string; ct: string; key_epoch: number }
function wire(row: Row): SyncWireRecord {
  return { rid: row.rid, seq: row.seq, deleted: row.deleted === 1, nonce: row.nonce, ct: row.ct, keyEpoch: row.key_epoch };
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) invalid("Missing JSON body");
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > SYNC_MAX_REQUEST_BYTES) { await reader.cancel(); throw new HttpError(413, "too_large", "Request exceeds 4 MiB"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return object(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))); }
  catch (e) { if (e instanceof HttpError) throw e; invalid("Invalid JSON body"); }
}
async function notify(env: Env, account: string, data: unknown): Promise<void> {
  if (!env.NOTIFIER) return;
  // A missed hint is harmless: polling is authoritative. Never fail an already committed write.
  try { await env.NOTIFIER.get(env.NOTIFIER.idFromName(account)).fetch("https://notifier/internal", { method: "POST", body: JSON.stringify(data) }); } catch {}
}
async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === "/v1/health" && method === "GET") return json({ ok: true, version: 1 });
  const account = await authenticate(request, env);
  const device = text((request.headers.get("X-OpenCast-Device") ?? request.headers.get("X-Surgecast-Device")), "X-OpenCast-Device", 128);
  const registration = path === "/v1/devices" && method === "POST";
  const known = await env.DB.prepare("SELECT revoked FROM devices WHERE account = ? AND device_id = ?").bind(account, device).first<{ revoked: number }>();
  if (known?.revoked && !registration) throw new HttpError(403, "device_revoked", "This device has been removed; explicitly reconnect to register it again");
  const stmt = (sql: string, ...args: unknown[]) => env.DB.prepare(sql).bind(...args);
  if (known && !known.revoked && !registration) await stmt("UPDATE devices SET last_seen_at = ? WHERE account = ? AND device_id = ? AND revoked = 0", Date.now(), account, device).run();
  if (path === "/v1/vault") {
    if (method === "GET") {
      const row = await stmt("SELECT vault_json FROM accounts WHERE account = ?", account).first<{ vault_json: string | null }>();
      if (!row?.vault_json) throw new HttpError(404, "vault_not_found", "No vault exists");
      return json(JSON.parse(row.vault_json));
    }
    if (method === "PUT") {
      const input = await body(request), v = vault(input);
      if (input.replace !== undefined && typeof input.replace !== "boolean") invalid("Invalid replace flag");
      const encoded = JSON.stringify(v);
      const result = input.replace === true
        ? await stmt("UPDATE accounts SET vault_id = ?, key_epoch = ?, vault_json = ? WHERE account = ? AND vault_id = ? AND vault_json IS NOT NULL RETURNING account", v.vaultId, v.keyEpoch, encoded, account, request.headers.get("If-Match")).all()
        : await stmt(`INSERT INTO accounts (account, vault_id, key_epoch, vault_json) VALUES (?, ?, ?, ?)
            ON CONFLICT(account) DO UPDATE SET vault_id = excluded.vault_id, key_epoch = excluded.key_epoch, vault_json = excluded.vault_json
            WHERE accounts.vault_json IS NULL RETURNING account`, account, v.vaultId, v.keyEpoch, encoded).all();
      if (!result.results.length) throw new HttpError(409, "vault_exists", "Vault exists or If-Match did not match");
      await notify(env, account, { type: "changed", seq: 0 });
      return json(v, input.replace ? 200 : 201);
    }
    if (method === "DELETE") {
      if ((request.headers.get("X-OpenCast-Confirm") ?? request.headers.get("X-Surgecast-Confirm")) !== "wipe") invalid("X-OpenCast-Confirm: wipe is required");
      await env.DB.batch([stmt("DELETE FROM records WHERE account = ?", account), stmt("DELETE FROM devices WHERE account = ?", account),
        stmt("UPDATE accounts SET vault_id = NULL, key_epoch = NULL, vault_json = NULL WHERE account = ?", account)]);
      await notify(env, account, { type: "wipe" });
      return json({ ok: true });
    }
  }
  if (path === "/v1/devices") {
    if (method === "POST") {
      const data = await body(request);
      if (text(data.deviceId, "deviceId", 128) !== device) invalid("deviceId must match the device header");
      const result = await stmt(`INSERT INTO devices (account, device_id, name, platform, app_version, last_seen_at, revoked)
        SELECT ?, ?, ?, ?, ?, ?, 0 FROM accounts WHERE account = ? AND vault_json IS NOT NULL
        ON CONFLICT(account, device_id) DO UPDATE SET name = excluded.name, platform = excluded.platform,
          app_version = excluded.app_version, last_seen_at = excluded.last_seen_at, revoked = 0 RETURNING device_id`,
        account, device, text(data.name, "name"), text(data.platform, "platform", 64), data.appVersion === undefined ? null : text(data.appVersion, "appVersion", 64), Date.now(), account).all();
      if (!result.results.length) throw new HttpError(404, "vault_not_found", "Create a vault before registering a device");
      return json({ deviceId: device }, 201);
    }
    if (method === "GET") {
      const result = await stmt(`SELECT device_id AS deviceId, name, platform, app_version AS appVersion, last_seen_at AS lastSeenAt
        FROM devices WHERE account = ? AND revoked = 0 ORDER BY device_id`, account).all();
      return json(result.results);
    }
  }
  if (path.startsWith("/v1/devices/") && method === "DELETE") {
    let id: string;
    try { id = text(decodeURIComponent(path.slice("/v1/devices/".length)), "deviceId", 128); } catch { invalid("Invalid deviceId"); }
    const result = await stmt("UPDATE devices SET revoked = 1 WHERE account = ? AND device_id = ? RETURNING device_id", account, id).all();
    if (!result.results.length) throw new HttpError(404, "device_not_found", "Device not found");
    await notify(env, account, { type: "revoked", deviceId: id });
    return json({ ok: true });
  }
  if (path === "/v1/push" && method === "POST") {
    if (!known) throw new HttpError(403, "device_not_registered", "Register this device before pushing");
    const data = await body(request);
    if (!Array.isArray(data.records) || data.records.length > SYNC_MAX_RECORDS) invalid("records must contain at most 200 entries");
    const records = data.records.map(pushRecord);
    if (new Set(records.map(r => r.rid)).size !== records.length) invalid("Duplicate rid in batch");
    const results: SyncPushResult[] = [];
    let changed = 0;
    for (const r of records) {
      // Sequence allocation, CAS, and conflict read are one D1 transaction. No pre-read races.
      const batch = await env.DB.batch([
        stmt(`UPDATE accounts SET last_seq = last_seq + 1 WHERE account = ? AND vault_json IS NOT NULL AND key_epoch = ? AND (? IS NULL OR vault_id = ?)
          AND EXISTS (SELECT 1 FROM devices WHERE account = ? AND device_id = ? AND revoked = 0) RETURNING last_seq`, account, r.keyEpoch, request.headers.get("If-Match"), request.headers.get("If-Match"), account, device),
        stmt(`INSERT INTO records (account, rid, seq, deleted, nonce, ct, key_epoch, updated_at, bytes)
          SELECT ?, ?, last_seq, ?, ?, ?, ?, ?, ? FROM accounts WHERE account = ? AND key_epoch = ? AND vault_json IS NOT NULL AND (? IS NULL OR vault_id = ?)
          AND EXISTS (SELECT 1 FROM devices WHERE account = ? AND device_id = ? AND revoked = 0)
          AND (? IS NULL OR EXISTS (SELECT 1 FROM records WHERE account = ? AND rid = ? AND seq = ?))
          ON CONFLICT(account, rid) DO UPDATE SET seq = excluded.seq, deleted = excluded.deleted, nonce = excluded.nonce,
            ct = excluded.ct, key_epoch = excluded.key_epoch, updated_at = excluded.updated_at, bytes = excluded.bytes
          WHERE records.seq = ? RETURNING seq`, account, r.rid, r.deleted ? 1 : 0, r.nonce, r.ct, r.keyEpoch, Date.now(), Math.floor(r.ct.length * 3 / 4), account, r.keyEpoch, request.headers.get("If-Match"), request.headers.get("If-Match"), account, device, r.baseSeq, account, r.rid, r.baseSeq, r.baseSeq),
        stmt("SELECT * FROM records WHERE account = ? AND rid = ?", account, r.rid),
        stmt("UPDATE devices SET last_seen_at = ? WHERE account = ? AND device_id = ? AND revoked = 0", Date.now(), account, device),
      ]);
      if (!batch[0].results.length) throw new HttpError(409, "vault_changed", "Vault epoch changed or device was removed");
      const accepted = batch[1].results[0] as { seq: number } | undefined;
      if (accepted) { changed = accepted.seq; results.push({ rid: r.rid, status: "ok", seq: accepted.seq }); }
      else {
        const current = batch[2].results[0] as unknown as Row | undefined;
        if (!current) throw new HttpError(409, "record_missing", "Record was removed by retention; pull from cursor 0 and retry with a null baseSeq");
        results.push({ rid: r.rid, status: "conflict", current: wire(current) });
      }
    }
    if (changed) await notify(env, account, { type: "changed", seq: changed });
    return json({ results });
  }
  if (path === "/v1/pull" && method === "GET") {
    const after = integer(Number(url.searchParams.get("after") ?? "0"), "after");
    const limit = integer(Number(url.searchParams.get("limit") ?? "200"), "limit", 1);
    if (limit > 1000) invalid("limit must not exceed 1000");
    // Bound ciphertext in a page as well as rows, avoiding a 1 GiB response for 1000 large records.
    const rows = await stmt(`SELECT * FROM (SELECT *, SUM(length(ct) + 256) OVER (ORDER BY seq) AS page_bytes
      FROM records WHERE account = ? AND seq > ? ORDER BY seq LIMIT ?) WHERE page_bytes <= ? ORDER BY seq`, account, after, limit, SYNC_MAX_REQUEST_BYTES - 256).all<Row>();
    const cursor = rows.results.at(-1)?.seq ?? after;
    const more = await stmt("SELECT 1 AS found FROM records WHERE account = ? AND seq > ? LIMIT 1", account, cursor).first();
    return json({ records: rows.results.map(wire), cursor, hasMore: !!more });
  }
  if (path === "/v1/stats" && method === "GET") {
    const result = await env.DB.batch([
      stmt("SELECT COUNT(*) - COALESCE(SUM(deleted), 0) AS records, COALESCE(SUM(deleted), 0) AS tombstones, COALESCE(SUM(bytes), 0) AS bytes FROM records WHERE account = ?", account),
      stmt("SELECT COUNT(*) AS devices FROM devices WHERE account = ? AND revoked = 0", account),
      stmt("SELECT last_seq AS lastSeq FROM accounts WHERE account = ?", account),
    ]);
    return json({ ...(result[0].results[0] as object), ...(result[1].results[0] as object), lastSeq: (result[2].results[0] as { lastSeq?: number } | undefined)?.lastSeq ?? 0 });
  }
  if (path === "/v1/events" && method === "GET") {
    if (!known) throw new HttpError(403, "device_not_registered", "Register before subscribing");
    if (!env.NOTIFIER) throw new HttpError(501, "events_unavailable", "This deployment uses polling only");
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new HttpError(426, "upgrade_required", "WebSocket upgrade required");
    return env.NOTIFIER.get(env.NOTIFIER.idFromName(account)).fetch(request.url, { headers: Object.fromEntries(request.headers) }) as unknown as Response;
  }
  throw new HttpError(404, "not_found", "Endpoint not found");
}
export async function handleRequest(request: Request, env: Env): Promise<Response> {
  try { return await route(request, env); }
  catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    // Database exceptions can contain bound data. Never expose or log them.
    return json({ error: "internal_error", message: "Sync server could not complete the request" }, 500);
  }
}
export async function collectTombstones(env: Env, now = Date.now()): Promise<void> {
  await env.DB.prepare("DELETE FROM records WHERE deleted = 1 AND updated_at < ?").bind(now - 90 * 86400000).run();
}
