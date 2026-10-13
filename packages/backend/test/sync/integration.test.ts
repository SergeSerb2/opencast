import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { Database } from "../../src/db/database";
import { EntityStore, entitiesMigration } from "../../src/db/entities";
import { SettingsService, settingsMigration } from "../../src/services/settings";
import { SecretsService } from "../../src/services/secrets";
import { EventBus } from "../../src/events";
import { RpcRegistry } from "../../src/rpc/registry";
import type { NativeApi } from "../../src/native/client";
import type { AppContext } from "../../src/context";
import type { BackendMethods, SyncStatus } from "@opencast/protocol";
import { syncService } from "../../src/services/sync";
import { handleRequest } from "../../../sync-worker/src/handler";
import { createTestEnv } from "../../../sync-worker/test/d1";
import { applyRemote } from "../../src/services/sync/conflicts";

function backend(dir: string, keys = new Map<string, string>()) {
  const db = new Database(join(dir, "opencast.db"));
  db.addMigrations(entitiesMigration, settingsMigration);
  const events = new EventBus(), entities = new EntityStore(db), nativeEvents = new EventEmitter();
  const native = { on(topic: string, fn: (...args: any[]) => void) { nativeEvents.on(topic, fn); return () => nativeEvents.off(topic, fn); },
    async call(method: string, params: { account: string; value?: string }) {
      if (method === "keychain.get") return keys.get(params.account) ?? null;
      if (method === "keychain.set") keys.set(params.account, params.value!);
      if (method === "keychain.delete") keys.delete(params.account);
    } } as unknown as NativeApi;
  const settings = new SettingsService(db, entities, events), secrets = new SecretsService(native), rpc = new RpcRegistry<BackendMethods>();
  const ready: (() => void | Promise<void>)[] = [], shutdown: (() => void | Promise<void>)[] = [];
  const ctx = { db, entities, events, native, settings, secrets, rpc, version: "test", dataDir: dir,
    onReady: (fn: () => void | Promise<void>) => ready.push(fn), onShutdown: (fn: () => void | Promise<void>) => shutdown.push(fn) } as unknown as AppContext;
  syncService.register(ctx); db.migrate();
  let closed = false;
  return { ctx, keys, nativeEvents, start: async () => { for (const fn of ready) await fn(); },
    async rpc(method: string, params: unknown = {}) { return rpc.invoke(method, params, { connectionId: "test", signal: new AbortController().signal }); },
    async close() { if (closed) return; closed = true; for (const fn of shutdown) await fn(); db.close(); } };
}
let env: ReturnType<typeof createTestEnv>;
let server: ReturnType<typeof createServer>;
let url: string, root: string;
let networkDown: boolean;
let beforePush: (() => void) | undefined;
let instances: ReturnType<typeof backend>[];
const connect = (app: ReturnType<typeof backend>, overrides = {}) => app.rpc("sync.connect", { serverUrl: url, token: "test-token", passphrase: "correct horse battery", ...overrides }) as Promise<SyncStatus>;
const sync = (app: ReturnType<typeof backend>) => app.rpc("sync.now") as Promise<SyncStatus>;
beforeEach(async () => {
  networkDown = false; beforePush = undefined;
  env = createTestEnv(); root = mkdtempSync(join(tmpdir(), "opencast-sync-test-")); instances = [];
  server = createServer(async (req, res) => {
    if (networkDown) { req.socket.destroy(); return; }
    if (req.url === "/v1/push" && beforePush) { const fn = beforePush; beforePush = undefined; fn(); }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as Record<string, string>,
      body: chunks.length ? Buffer.concat(chunks) : undefined });
    const response = await handleRequest(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(async () => {
  for (const instance of instances) await instance.close();
  server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  env.close(); rmSync(root, { recursive: true, force: true });
});
async function make(name: string) { const app = backend(join(root, name)); instances.push(app); await app.start(); return app; }
describe("two independent backend stores through the production worker handler", () => {
  it("publishes valid records past oversized dirty records and recovers after editing them", async () => {
    const a = await make("A"), b = await make("B"); await connect(a); await connect(b);
    a.ctx.entities.put("notes", "large-0", { content: randomBytes(1100 * 1024).toString("base64") });
    a.ctx.entities.put("quicklinks", "valid", { link: "https://example.com" });
    const status = await sync(a);
    await sync(b);
    expect(b.ctx.entities.get("quicklinks", "valid")).toBeDefined();
    expect(status.lastError).toContain("1 record");
    expect(a.ctx.entities.get("notes", "large-0")?.syncDirty).toBe(true);
    a.ctx.entities.patch("notes", "large-0", { content: "small" });
    await sync(a); await sync(b);
    expect(b.ctx.entities.get<any>("notes", "large-0")?.data.content).toBe("small");
  });

  it("creates, merges conflicting edits with a preserved note copy, and propagates tombstones", async () => {
    const a = await make("A"), b = await make("B");
    expect((await connect(a)).phase).toBe("online"); expect((await connect(b)).phase).toBe("online");
    a.ctx.entities.put("notes", "shared", { id: "shared", title: "Example", content: "initial" });
    expect((await sync(a)).phase).toBe("online"); await sync(b);
    expect(b.ctx.entities.get<any>("notes", "shared")?.data.content).toBe("initial");
    // B's pending edit loses to A's newer edit when B pulls, and is preserved as a copy.
    b.ctx.entities.patch("notes", "shared", { content: "B offline edit" });
    a.ctx.entities.patch("notes", "shared", { content: "A newer edit" });
    await sync(a); expect((await sync(b)).phase).toBe("online"); await sync(a);
    expect(b.ctx.entities.get<any>("notes", "shared")?.data.content).toBe("A newer edit");
    const copies = a.ctx.entities.list<any>("notes").filter(r => r.id !== "shared");
    expect(copies).toHaveLength(1); expect(copies[0].data.title).toBe("Example (Conflicted Copy)"); expect(copies[0].data.content).toBe("B offline edit");
    a.ctx.entities.delete("notes", "shared"); await sync(a); await sync(b);
    expect(b.ctx.entities.get("notes", "shared")).toBeUndefined();
    expect(b.ctx.entities.get("notes", "shared", { includeDeleted: true })?.deleted).toBe(true);
    // The server and SQLite configuration contain neither secrets nor plaintext user content.
    const rows = env.sqlite.prepare("SELECT * FROM records").all();
    expect(JSON.stringify(rows)).not.toContain("offline edit");
    expect(a.ctx.db.all("SELECT * FROM sync_state").map(row => JSON.stringify(row)).join()).not.toContain(a.keys.get("sync:vmk"));
    expect(a.keys.has("sync:token")).toBe(true);
  });
  it("retains disabled content, catches up after re-enabling, and never starves enabled rows", async () => {
    const a = await make("A"), b = await make("B"); await connect(a); await connect(b);
    await b.rpc("sync.setCategoryEnabled", { category: "notes", enabled: false });
    a.ctx.entities.put("notes", "remote", { title: "Remote", content: "private note" }); await sync(a); await sync(b);
    expect(b.ctx.entities.get("notes", "remote")).toBeUndefined();
    for (let i = 0; i < 450; i++) b.ctx.entities.put("notes", `disabled-${i}`, { title: "Local", content: "local" });
    b.ctx.entities.put("quicklinks", "link", { url: "https://example.com" });
    expect((await sync(b)).phase).toBe("online"); await sync(a);
    expect(a.ctx.entities.get("quicklinks", "link")).toBeDefined();
    expect(a.ctx.entities.get("notes", "disabled-0")).toBeUndefined();
    await b.rpc("sync.setCategoryEnabled", { category: "notes", enabled: true }); await sync(b); await sync(a);
    expect(b.ctx.entities.get("notes", "remote")).toBeDefined();
    expect(a.ctx.entities.count("notes")).toBe(451);
  });
  it("reports wrong passphrases, forgets keys on disconnect, and preserves all local data", async () => {
    const a = await make("A"), b = await make("B"); await connect(a);
    await expect(connect(b, { passphrase: "wrong" })).rejects.toThrow("Wrong passphrase");
    expect((await b.rpc("sync.status") as SyncStatus).phase).toBe("needs-passphrase");
    await connect(b); b.ctx.entities.put("notes", "local", { title: "keep me", content: "saved" });
    await b.rpc("sync.disconnect", { forgetKeys: true });
    expect(b.keys.size).toBe(0); expect(b.ctx.entities.get("notes", "local")).toBeDefined();
    expect((await sync(b)).phase).toBe("disabled");
  });
  it("pins vault identity, stops revoked devices, and wipes only remote data", async () => {
    const a = await make("A"), b = await make("B"); await connect(a); await connect(b);
    const bId = (await b.rpc("sync.status") as SyncStatus).deviceId;
    await a.rpc("sync.removeDevice", { deviceId: bId });
    expect((await sync(b)).lastError).toContain("device was removed");
    await connect(b); expect((await b.rpc("sync.devices") as any[]).find(d => d.deviceId === bId)?.current).toBe(true);
    a.ctx.entities.put("notes", "keep", { title: "Keep", content: "local" }); await sync(a);
    await a.rpc("sync.wipeRemote", { confirm: "wipe" });
    expect(a.ctx.entities.get("notes", "keep")).toBeDefined(); expect(a.keys.size).toBe(0);
    expect(env.sqlite.prepare("SELECT COUNT(*) AS n FROM records").get()?.n).toBe(0);
    expect((await sync(b)).phase).toBe("needs-passphrase");
    await connect(a); expect((await sync(b)).phase).toBe("needs-passphrase");
  });
  it("resumes with a stable device and Keychain keys, and recovers from network failure", async () => {
    const a = await make("A"); await connect(a);
    const id = (await a.rpc("sync.status") as SyncStatus).deviceId;
    await a.close();
    const resumed = backend(join(root, "A"), a.keys); instances.push(resumed); await resumed.start();
    expect((await sync(resumed)).phase).toBe("online");
    expect((await resumed.rpc("sync.status") as SyncStatus).deviceId).toBe(id);
    networkDown = true;
    expect((await sync(resumed)).phase).toBe("offline");
    resumed.ctx.entities.put("notes", "offline", { title: "Offline", content: "pending" });
    networkDown = false;
    expect((await sync(resumed)).phase).toBe("online");
    expect(resumed.ctx.entities.get("notes", "offline")?.syncDirty).toBe(false);
    await resumed.close();
    const locked = backend(join(root, "A")); instances.push(locked); await locked.start();
    expect((await locked.rpc("sync.status") as SyncStatus).phase).toBe("needs-passphrase");
  });
  it("does not clear a local edit made while an older version is in flight", async () => {
    const a = await make("A"), b = await make("B"); await connect(a); await connect(b);
    a.ctx.entities.put("notes", "inflight", { title: "Race", content: "first" });
    beforePush = () => a.ctx.entities.patch("notes", "inflight", { content: "changed during push" });
    expect((await sync(a)).phase).toBe("online"); await sync(b);
    expect(b.ctx.entities.get<any>("notes", "inflight")?.data.content).toBe("changed during push");
    expect(a.ctx.entities.get("notes", "inflight")?.syncDirty).toBe(false);
  });
  it("keeps newer local versions dirty, avoids copies for unchanged contents, and preserves edits on remote deletion", async () => {
    const a = await make("A");
    const local = a.ctx.entities.put("notes", "n", { title: "Title", content: "text" });
    const payload = { v: 1 as const, collection: "notes", id: "n", createdAt: local.createdAt, updatedAt: local.updatedAt, deleted: false, data: local.data };
    expect(applyRemote(a.ctx.entities, payload, 1)).toBe("stale");
    expect(a.ctx.entities.get("notes", "n")?.syncDirty).toBe(true);
    applyRemote(a.ctx.entities, { ...payload, updatedAt: payload.updatedAt + 1, data: { title: "New title", content: "text" } }, 2);
    expect(a.ctx.entities.count("notes")).toBe(1);
    const edit = a.ctx.entities.patch("notes", "n", { content: "unsent" });
    applyRemote(a.ctx.entities, { ...payload, updatedAt: edit.updatedAt + 1, deleted: true, data: {} }, 3);
    expect(a.ctx.entities.get("notes", "n")).toBeUndefined();
    expect(a.ctx.entities.list<any>("notes")[0].data.content).toBe("unsent");
  });
});
