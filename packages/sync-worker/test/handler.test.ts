import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleRequest, collectTombstones } from "../src/handler";
import { createTestEnv } from "./d1";

let env: ReturnType<typeof createTestEnv>;
const b64 = (size: number, byte = 1) => Buffer.alloc(size, byte).toString("base64url");
const vault = { vaultId: "test-vault", keyEpoch: 1, kdf: { alg: "scrypt", N: 131072, r: 8, p: 1, salt: b64(16) }, wrapped: { nonce: b64(12), ct: b64(48) } };
const record = (rid = b64(32), baseSeq: number | null = null) => ({ rid, baseSeq, deleted: false, nonce: b64(12), ct: b64(32), keyEpoch: 1 });
async function call(path: string, method = "GET", data?: unknown, headers: Record<string, string> = {}) {
  const response = await handleRequest(new Request("http://localhost" + path, { method, headers: { Authorization: "Bearer test-token", "X-Surgecast-Device": "A", ...headers }, body: data === undefined ? undefined : JSON.stringify(data) }), env);
  return { status: response.status, body: await response.json() as any };
}
async function setup() {
  expect((await call("/v1/vault", "PUT", vault)).status).toBe(201);
  expect((await call("/v1/devices", "POST", { deviceId: "A", name: "Mac", platform: "macos" })).status).toBe(201);
}
beforeEach(() => { env = createTestEnv(); });
afterEach(() => env.close());
describe("ciphertext sync HTTP API", () => {
  it("authenticates account tokens, requires devices, and isolates tenants", async () => {
    expect((await call("/v1/health", "GET", undefined, { Authorization: "" })).body).toEqual({ ok: true, version: 1 });
    expect((await call("/v1/vault", "GET", undefined, { Authorization: "Bearer wrong" })).status).toBe(401);
    expect((await call("/v1/vault", "GET", undefined, { "X-Surgecast-Device": "" })).status).toBe(400);
    await setup();
    expect((await call("/v1/vault", "GET", undefined, { Authorization: "Bearer other-token" })).status).toBe(404);
    expect((await call("/v1/devices", "POST", { deviceId: "B", name: "Mac", platform: "macos" })).status).toBe(400);
  });
  it("creates, conditionally replaces, and explicitly wipes a vault", async () => {
    await setup();
    expect((await call("/v1/vault", "PUT", vault)).status).toBe(409);
    expect((await call("/v1/vault", "PUT", { ...vault, replace: true }, { "If-Match": "wrong" })).status).toBe(409);
    expect((await call("/v1/vault", "PUT", { ...vault, replace: true }, { "If-Match": vault.vaultId })).status).toBe(200);
    await call("/v1/push", "POST", { records: [record()] });
    expect((await call("/v1/vault", "DELETE")).status).toBe(400);
    expect((await call("/v1/vault", "DELETE", undefined, { "X-Surgecast-Confirm": "wipe" })).status).toBe(200);
    expect((await call("/v1/vault")).status).toBe(404);
    expect((await call("/v1/devices")).body).toEqual([]);
    expect((await call("/v1/pull")).body.records).toEqual([]);
    await setup();
    const pushed = await call("/v1/push", "POST", { records: [record()] });
    expect(pushed.body.results[0].seq).toBeGreaterThan(1);
  });
  it("CASes each record, preserves tombstones, orders pages, and reports stats", async () => {
    await setup();
    const r = record();
    const initial = (await call("/v1/push", "POST", { records: [r] })).body.results[0];
    expect(initial).toEqual({ rid: r.rid, status: "ok", seq: 1 });
    const conflict = (await call("/v1/push", "POST", { records: [r] })).body.results[0];
    expect(conflict.status).toBe("conflict"); expect(conflict.current.seq).toBe(1);
    const updated = (await call("/v1/push", "POST", { records: [{ ...r, baseSeq: 1, deleted: true }, record(b64(32, 2))] })).body.results;
    expect(updated.map((x: any) => x.status)).toEqual(["ok", "ok"]);
    expect((await call("/v1/push", "POST", { records: [r] })).body.results[0].status).toBe("conflict");
    const page = (await call("/v1/pull?after=0&limit=1")).body;
    expect(page.records[0].deleted).toBe(true); expect(page.hasMore).toBe(true);
    const next = (await call(`/v1/pull?after=${page.cursor}&limit=1`)).body;
    expect(next.records[0].seq).toBeGreaterThan(page.cursor); expect(next.hasMore).toBe(false);
    expect((await call("/v1/stats")).body).toEqual({ records: 1, tombstones: 1, bytes: 64, devices: 1, lastSeq: 5 });
  });
  it("allows only one concurrent writer for a given base sequence", async () => {
    await setup();
    await call("/v1/push", "POST", { records: [record()] });
    const results = await Promise.all(Array.from({ length: 10 }, () => call("/v1/push", "POST", { records: [record(b64(32), 1)] })));
    expect(results.filter(r => r.body.results[0].status === "ok")).toHaveLength(1);
    expect(results.filter(r => r.body.results[0].status === "conflict")).toHaveLength(9);
  });
  it("revokes devices and permits only explicit same-device registration", async () => {
    await setup();
    expect((await call("/v1/devices/A", "DELETE")).status).toBe(200);
    for (const path of ["/v1/vault", "/v1/pull", "/v1/devices", "/v1/events"]) expect((await call(path)).body.error).toBe("device_revoked");
    expect((await call("/v1/devices", "POST", { deviceId: "A", name: "Mac", platform: "macos" })).status).toBe(201);
    expect((await call("/v1/vault")).status).toBe(200);
    expect((await call("/v1/events")).status).toBe(501);
  });
  it("rejects malformed, oversized and duplicate records without partial writes", async () => {
    await setup();
    for (const records of [[{ ...record(), nonce: "bad" }], [{ ...record(), keyEpoch: 0 }], [record(), record()], Array(201).fill(record())]) {
      expect((await call("/v1/push", "POST", { records })).status).toBe(400);
    }
    expect((await call("/v1/push", "POST", { records: [{ ...record(), ct: b64(1024 * 1024 + 1) }] })).status).toBe(413);
    expect((await call("/v1/push", "POST", { padding: "a".repeat(4 * 1024 * 1024) })).status).toBe(413);
    expect((await call("/v1/pull?limit=1001")).status).toBe(400);
    expect((await call("/v1/pull?after=-1")).status).toBe(400);
    expect((await call("/v1/stats")).body.records).toBe(0);
    expect((await call("/v1/push", "POST", { records: [record()] }, { "If-Match": "old-vault" })).body.error).toBe("vault_changed");
  });
  it("bounds large pull pages and collects only tombstones older than 90 days", async () => {
    await setup();
    const large = [1, 2, 3, 4].map(n => ({ ...record(b64(32, n)), ct: b64(1024 * 1024), deleted: n === 1 }));
    for (const r of large) expect((await call("/v1/push", "POST", { records: [r] })).status).toBe(200);
    const page = (await call("/v1/pull?limit=1000")).body;
    expect(page.records.length).toBeGreaterThan(0); expect(page.records.length).toBeLessThan(4); expect(page.hasMore).toBe(true);
    env.sqlite.prepare("UPDATE records SET updated_at = ? WHERE rid = ?").run(Date.now() - 91 * 86400000, large[0].rid);
    await collectTombstones(env);
    expect((await call("/v1/stats")).body.tombstones).toBe(0);
    expect((await call("/v1/stats")).body.records).toBe(3);
  });
});
