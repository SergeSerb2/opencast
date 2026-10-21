import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";

// Full bundled processes + JSON-RPC. The mock native host keeps Keychain secrets isolated in RAM.
const url = process.env.SYNC_TEST_URL ?? "http://127.0.0.1:18787";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(url).hostname), "Process smoke tests require localhost");
const token = process.env.SYNC_TEST_TOKEN ?? "local-test";
const root = mkdtempSync(join(tmpdir(), "opencast-sync-process-"));
const apps = [];
async function wipe() {
  const response = await fetch(url + "/v1/vault", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "X-OpenCast-Device": "process-test", "X-OpenCast-Confirm": "wipe" } });
  assert.equal(response.status, 200);
}
async function start(name, keys = new Map()) {
  const dir = join(root, name);
  const processChild = spawn(process.execPath, [resolve("packages/backend/dist/index.mjs"), "--dev", "--data-dir", dir, "--port", "0", "--token", "rpc-test"], { stdio: ["pipe", "pipe", "pipe"] });
  const app = { processChild, dir, keys, stderr: "", next: 1, pending: new Map() }; apps.push(app);
  processChild.stderr.on("data", chunk => { app.stderr += chunk.toString(); });
  const ready = await new Promise((accept, reject) => {
    const timer = setTimeout(() => reject(new Error("Backend startup timed out")), 10000);
    processChild.once("exit", code => { clearTimeout(timer); reject(new Error(`Backend exited ${code}`)); });
    createInterface({ input: processChild.stdout }).on("line", line => {
      const message = JSON.parse(line);
      if (message.method === "backend.ready") { clearTimeout(timer); accept(message.params); return; }
      if (message.id === undefined) return;
      let result = null;
      const { account, value } = message.params ?? {};
      if (message.method === "keychain.get") result = keys.get(account) ?? null;
      else if (message.method === "keychain.set") keys.set(account, value);
      else if (message.method === "keychain.delete") keys.delete(account);
      else { processChild.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Mock native method unavailable" } }) + "\n"); return; }
      processChild.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\n");
    });
  });
  app.socket = new WebSocket(`ws://127.0.0.1:${ready.port}/rpc?token=rpc-test`);
  await new Promise((accept, reject) => { app.socket.once("open", accept); app.socket.once("error", reject); });
  app.socket.on("message", bytes => {
    const message = JSON.parse(bytes.toString());
    const pending = app.pending.get(message.id);
    if (!pending) return;
    app.pending.delete(message.id); clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
  });
  app.rpc = (method, params = {}) => new Promise((resolveResult, reject) => {
    const id = app.next++, timer = setTimeout(() => reject(new Error(`RPC timed out: ${method}`)), 10000);
    app.pending.set(id, { resolve: resolveResult, reject, timer });
    app.socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  });
  // The backend may hold a write lock (for example during its first sync); wait instead of failing.
  app.db = new DatabaseSync(join(dir, "opencast.db"), { timeout: 5000 });
  return app;
}
async function close(app) {
  if (app.closed) return;
  app.closed = true;
  app.socket?.terminate(); app.db?.close();
  const ended = new Promise(resolveExit => app.processChild.once("exit", resolveExit));
  app.processChild.kill("SIGTERM");
  const forced = setTimeout(() => app.processChild.kill("SIGKILL"), 3000);
  await ended; clearTimeout(forced);
}
function put(app, id, content, updatedAt) {
  app.db.prepare(`INSERT INTO entities(collection,id,data,created_at,updated_at,sync_dirty) VALUES ('notes',?,?,?,?,1)
    ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=0,sync_dirty=1`)
    .run(id, JSON.stringify({ id, title: "Example", content }), updatedAt, updatedAt);
}
function note(app, id) { const row = app.db.prepare("SELECT data FROM entities WHERE collection='notes' AND id=? AND deleted=0").get(id); return row ? JSON.parse(row.data) : undefined; }
async function now(app) { const result = await app.rpc("sync.now"); assert.equal(result.phase, "online", result.lastError); }
const keySentinels = ["initial", "rotated"].map(label => `opencast-key-sync-${label}-${randomUUID()}`);
function assertNoKeyLeaks() {
  for (const app of apps) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = join(app.dir, "opencast.db" + suffix);
      if (!existsSync(file)) continue;
      const bytes = readFileSync(file);
      assert.ok(keySentinels.every(key => !bytes.includes(Buffer.from(key))), `Provider key appeared in ${file}`);
    }
    assert.ok(keySentinels.every(key => !app.stderr.includes(key)), "Provider key appeared in backend stderr");
  }
}
try {
  await wipe();
  const a = await start("A"), b = await start("B");
  for (const app of apps) {
    const info = await app.rpc("app.info"); assert.ok(info.methods.includes("sync.connect"));
  }
  const credentials = { serverUrl: url, token };
  const passphrase = "process smoke passphrase";
  assert.deepEqual(await a.rpc("sync.probe", credentials), { vault: "absent", deviceRevoked: false, configured: true });
  await assert.rejects(b.rpc("sync.probe", { ...credentials, token: "incorrect" }), /Invalid sync server token/);
  await assert.rejects(a.rpc("sync.probe", { ...credentials, serverUrl: url + "/not-sync" }), /not an OpenCast sync server/);
  await assert.rejects(a.rpc("sync.connect", { ...credentials, passphrase: "short", expectVault: "create" }), /at least 12/);
  const created = await a.rpc("sync.connect", { ...credentials, passphrase, deviceName: "A", expectVault: "create" });
  assert.equal(created.phase, "online", created.lastError);
  const setup = await a.rpc("sync.setupCode");
  assert.equal(setup.serverUrl, url);
  assert.ok(setup.code.startsWith("opencast-sync-v1:"));
  const parsed = await b.rpc("sync.parseSetupCode", { code: `  ${setup.code}\n` });
  assert.deepEqual(parsed, credentials);
  for (const code of [setup.code.replace("-v1:", "-v2:"), setup.code.slice(0, -5),
    "opencast-sync-v1:" + Buffer.from(JSON.stringify({ url: "http://example.com", token })).toString("base64url")]) {
    await assert.rejects(b.rpc("sync.parseSetupCode", { code }));
  }
  assert.deepEqual(await b.rpc("sync.probe", parsed), { vault: "present", deviceRevoked: false, configured: true });
  await assert.rejects(b.rpc("sync.connect", { ...parsed, passphrase, expectVault: "create" }), /vault already exists/);
  await assert.rejects(b.rpc("sync.connect", { ...parsed, passphrase: "wrong passphrase", expectVault: "join" }), /Wrong passphrase/);
  const joined = await b.rpc("sync.connect", { ...parsed, passphrase, deviceName: "B", expectVault: "join" });
  assert.equal(joined.phase, "online", joined.lastError);
  const base = Date.now(); put(a, "shared", "initial", base); await now(a); await now(b);
  assert.equal(note(b, "shared").content, "initial");
  put(b, "shared", "B unsent", base + 100); put(a, "shared", "A newer", base + 200);
  await now(a); await now(b); await now(a);
  assert.equal(note(b, "shared").content, "A newer");
  const copies = a.db.prepare("SELECT id,data FROM entities WHERE collection='notes' AND id!='shared' AND deleted=0").all();
  assert.equal(copies.length, 1); assert.equal(JSON.parse(copies[0].data).content, "B unsent");
  a.db.prepare("UPDATE entities SET deleted=1,data='{}',sync_dirty=1,updated_at=? WHERE collection='notes' AND id='shared'").run(base + 300);
  await now(a); await now(b); assert.equal(note(b, "shared"), undefined);
  for (const app of apps) {
    assert.equal(app.keys.size, 2);
    for (const value of app.keys.values()) assert.ok(!app.stderr.includes(value), "Secret appeared in backend logs");
  }
  for (const app of [a, b]) {
    assert.ok(!(await app.rpc("settings.getAll"))["sync.optInCategories"].includes("ai-keys"));
    await app.rpc("sync.setCategoryEnabled", { category: "ai-keys", enabled: true });
  }
  // Disable discovery so this scenario needs only the sync Worker, with no AI server.
  const provider = await a.rpc("ai.providers.upsert", {
    provider: { name: "Key Sync Smoke", template: "custom", api: "openai", baseUrl: url + "/v1", enabled: false, autoFetchModels: false },
    apiKey: keySentinels[0],
  });
  const account = `ai.provider:${provider.id}:apiKey`;
  await now(a); await now(b);
  assert.equal((await b.rpc("ai.providers.list")).find(p => p.id === provider.id)?.hasApiKey, true);
  assert.ok(b.keys.get(account) === keySentinels[0], "A's provider key did not reach B's Keychain");
  assertNoKeyLeaks();
  await b.rpc("ai.providers.upsert", { provider, apiKey: keySentinels[1] });
  await now(b); await now(a);
  assert.ok(a.keys.get(account) === keySentinels[1], "B's rotated provider key did not reach A's Keychain");
  assertNoKeyLeaks();
  await a.rpc("ai.providers.delete", { id: provider.id });
  await now(a); await now(b);
  assert.equal(a.keys.has(account), false);
  assert.equal(b.keys.has(account), false, "Provider deletion left B's Keychain key behind");
  assert.ok(!(await b.rpc("ai.providers.list")).some(p => p.id === provider.id));
  assertNoKeyLeaks();
  const previousVault = await (await fetch(url + "/v1/vault", { headers: { Authorization: `Bearer ${token}`, "X-OpenCast-Device": "process-test" } })).json();
  await assert.rejects(a.rpc("sync.changePassphrase", { newPassphrase: "short" }), /at least 12/);
  const newPassphrase = "new process smoke passphrase";
  await a.rpc("sync.changePassphrase", { newPassphrase });
  const rewrapped = await (await fetch(url + "/v1/vault", { headers: { Authorization: `Bearer ${token}`, "X-OpenCast-Device": "process-test" } })).json();
  assert.equal(rewrapped.vaultId, previousVault.vaultId); assert.equal(rewrapped.keyEpoch, previousVault.keyEpoch);
  assert.notDeepEqual(rewrapped.wrapped, previousVault.wrapped);
  await now(a); await now(b);
  await b.rpc("sync.disconnect");
  await assert.rejects(b.rpc("sync.connect", { ...parsed, passphrase, expectVault: "join" }), /Wrong passphrase/);
  assert.equal((await b.rpc("sync.connect", { ...parsed, passphrase: newPassphrase, expectVault: "join" })).phase, "online");
  await assert.rejects(a.rpc("sync.updateToken", { token: "incorrect" }), /Invalid sync server token/);
  assert.equal(a.keys.get("sync:token"), token);
  const rotatedToken = process.env.SYNC_TEST_ROTATED_TOKEN ?? token;
  assert.equal((await a.rpc("sync.updateToken", { token: rotatedToken })).phase, "online");
  const refreshed = await b.rpc("sync.parseSetupCode", { code: (await a.rpc("sync.setupCode")).code });
  assert.equal(refreshed.token, rotatedToken);
  await now(a); await now(b);
  await a.rpc("sync.updateToken", { token });
  const bStatus = await b.rpc("sync.status");
  await a.rpc("sync.removeDevice", { deviceId: bStatus.deviceId });
  assert.deepEqual(await b.rpc("sync.probe", parsed), { vault: "unknown", deviceRevoked: true, configured: true });
  const removed = await b.rpc("sync.now"); assert.equal(removed.stopReason, "device-removed");
  assert.equal((await b.rpc("sync.connect", { ...parsed, passphrase: newPassphrase, expectVault: "join" })).stopReason, undefined);
  await wipe();
  const stopped = await b.rpc("sync.now"); assert.equal(stopped.stopReason, "vault-changed");
  await assert.rejects(b.rpc("sync.connect", { ...parsed, passphrase, expectVault: "join" }), /No vault exists for that token/);
  const absent = await fetch(url + "/v1/vault", { headers: { Authorization: `Bearer ${token}`, "X-OpenCast-Device": "process-test" } });
  assert.equal(absent.status, 404, "Joining must not create a missing vault");
  assert.equal((await b.rpc("sync.status")).stopReason, "vault-changed");
  await close(b);
  const restarted = await start("B", b.keys);
  const resumed = await restarted.rpc("sync.status");
  assert.equal(resumed.phase, "disabled"); assert.equal(resumed.stopReason, "vault-changed"); assert.equal(resumed.serverUrl, url);
  await restarted.rpc("sync.disconnect"); assert.equal((await restarted.rpc("sync.status")).stopReason, undefined);
  for (const app of apps) {
    for (const secret of [...app.keys.values(), token, rotatedToken, passphrase, newPassphrase]) assert.ok(!app.stderr.includes(secret), "Secret appeared in backend logs");
  }
  assertNoKeyLeaks();
  console.log("Bundled backend processes: probe, setup-code handoff, explicit create/join, wrong passphrase, absent-vault guard, revocation, stop reasons, passphrase rewrap, token update, Keychain isolation, encrypted conflicts and tombstones, opted-in provider key transfer, rotation, deletion and SQLite/stderr leak checks passed");
} finally {
  for (const app of apps) await close(app);
  await wipe(); rmSync(root, { recursive: true, force: true });
}
