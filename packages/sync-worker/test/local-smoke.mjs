import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../backend/package.json", import.meta.url));
const WebSocket = require("ws");
const url = process.env.SYNC_TEST_URL ?? "http://127.0.0.1:18787";
const token = process.env.SYNC_TEST_TOKEN ?? "local-test";
const headers = { Authorization: `Bearer ${token}`, "X-Surgecast-Device": "local-smoke" };
async function call(path, method = "GET", body, extra = {}, status = 200) {
  const r = await fetch(url + path, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data;
}
const b64 = n => Buffer.alloc(n, 1).toString("base64url");
const vault = { vaultId: "local-smoke-vault", keyEpoch: 1, kdf: { alg: "scrypt", N: 131072, r: 8, p: 1, salt: b64(16) }, wrapped: { nonce: b64(12), ct: b64(48) } };
assert.equal((await call("/v1/health")).ok, true);
// This smoke test intentionally wipes its dedicated local account. Never use a production token.
assert.ok(new URL(url).hostname === "127.0.0.1" || new URL(url).hostname === "localhost", "Smoke tests require localhost");
await call("/v1/vault", "DELETE", undefined, { "X-Surgecast-Confirm": "wipe" });
await call("/v1/vault", "PUT", vault, {}, 201);
await call("/v1/vault", "PUT", vault, {}, 409);
await call("/v1/devices", "POST", { deviceId: "local-smoke", name: "Local smoke", platform: "test" }, {}, 201);
const socket = new WebSocket(url.replace(/^http/, "ws") + "/v1/events", { headers });
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
const hint = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("No WebSocket changed notification")), 5000);
  socket.once("message", bytes => { clearTimeout(timer); resolve(JSON.parse(bytes.toString())); });
});
const record = { rid: b64(32), baseSeq: null, deleted: false, nonce: b64(12), ct: b64(32), keyEpoch: 1 };
const push = await call("/v1/push", "POST", { records: [record] });
assert.equal(push.results[0].status, "ok"); assert.equal((await hint).type, "changed");
assert.equal((await call("/v1/push", "POST", { records: [record] })).results[0].status, "conflict");
assert.equal((await call("/v1/pull?after=0&limit=1")).records.length, 1);
const deleted = await call("/v1/push", "POST", { records: [{ ...record, baseSeq: push.results[0].seq, deleted: true }] });
assert.equal(deleted.results[0].status, "ok");
assert.equal((await call("/v1/stats")).tombstones, 1);
const revoked = new Promise(resolve => socket.once("close", code => resolve(code)));
await call("/v1/devices/local-smoke", "DELETE"); assert.equal(await revoked, 4003);
await call("/v1/pull", "GET", undefined, {}, 403);
await call("/v1/devices", "POST", { deviceId: "local-smoke", name: "Local smoke", platform: "test" }, {}, 201);
await call("/v1/vault", "DELETE", undefined, { "X-Surgecast-Confirm": "wipe" });
await call("/v1/vault", "GET", undefined, {}, 404);
assert.equal((await call("/v1/stats")).devices, 0);
console.log("Wrangler local: vault, device, CAS, pull, tombstone, stats, WebSocket notification, revocation and wipe passed");
