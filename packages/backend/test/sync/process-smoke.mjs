import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, rmSync } from "node:fs";
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
async function start(name) {
  const dir = join(root, name), keys = new Map();
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
  app.db = new DatabaseSync(join(dir, "opencast.db"));
  return app;
}
function put(app, id, content, updatedAt) {
  app.db.prepare(`INSERT INTO entities(collection,id,data,created_at,updated_at,sync_dirty) VALUES ('notes',?,?,?,?,1)
    ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=0,sync_dirty=1`)
    .run(id, JSON.stringify({ id, title: "Example", content }), updatedAt, updatedAt);
}
function note(app, id) { const row = app.db.prepare("SELECT data FROM entities WHERE collection='notes' AND id=? AND deleted=0").get(id); return row ? JSON.parse(row.data) : undefined; }
async function now(app) { const result = await app.rpc("sync.now"); assert.equal(result.phase, "online", result.lastError); }
try {
  await wipe();
  const a = await start("A"), b = await start("B");
  for (const app of apps) {
    const info = await app.rpc("app.info"); assert.ok(info.methods.includes("sync.connect"));
    const status = await app.rpc("sync.connect", { serverUrl: url, token, passphrase: "process smoke passphrase", deviceName: app === a ? "A" : "B" });
    assert.equal(status.phase, "online", status.lastError);
  }
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
  console.log("Bundled backend processes: WebSocket RPC, Keychain isolation, encrypted create, conflicting edits, copy preservation and tombstone propagation passed");
} finally {
  for (const app of apps) {
    app.socket?.terminate(); app.db?.close();
    const ended = new Promise(resolveExit => app.processChild.once("exit", resolveExit));
    app.processChild.kill("SIGTERM");
    const forced = setTimeout(() => app.processChild.kill("SIGKILL"), 3000);
    await ended; clearTimeout(forced);
  }
  await wipe(); rmSync(root, { recursive: true, force: true });
}
