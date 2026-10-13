import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { SYNC_CATEGORIES, SYNC_MAX_RECORDS, SYNC_MAX_REQUEST_BYTES, type SyncStatus, type SyncDevice,
  type SyncVault, type SyncPullPage, type SyncPushResult, type SyncPushRecord } from "@surgecast/protocol";
import type { AppContext } from "../../context";
import type { EntityRecord } from "../../db/entities";
import { createVault, unwrapVault, deriveKeys, decode, encryptRecord, decryptRecord, validateVault, type VaultKeys } from "./crypto";
import { categoryFor, isEnabled } from "./categories";
import { applyRemote } from "./conflicts";
import { normalizeServerUrl, SyncHttp, SyncHttpError, SyncNetworkError } from "./http";

export const syncMigration = { id: "sync-001-state", up: "CREATE TABLE sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)" };
interface Session {
  http: SyncHttp;
  vault: Pick<SyncVault, "vaultId" | "keyEpoch">;
  keys: VaultKeys;
  controller: AbortController;
}
interface ConnectOptions { serverUrl: string; token: string; passphrase: string; deviceName?: string }
export class SyncEngine {
  private session?: Session;
  private timer?: NodeJS.Timeout;
  private localTimer?: NodeJS.Timeout;
  private socketTimer?: NodeJS.Timeout;
  private socket?: WebSocket;
  private running?: Promise<SyncStatus>;
  private lifecycle = Promise.resolve();
  private failures = 0;
  private socketFailures = 0;
  private replayGeneration = 0;
  private rerun = false;
  private phase: SyncStatus["phase"] = "disabled";
  private lastError?: string;
  private unlisten: (() => void)[] = [];

  constructor(private readonly ctx: AppContext) {}
  private getState(key: string): string | undefined { return this.ctx.db.get<{ value: string }>("SELECT value FROM sync_state WHERE key = ?", key)?.value; }
  private setState(key: string, value: string): void { this.ctx.db.run("INSERT INTO sync_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value); }
  private deviceId(): string {
    let id = this.getState("deviceId");
    if (!id) { id = randomUUID(); this.setState("deviceId", id); }
    return id;
  }
  private disabled(): string[] { return this.ctx.settings.get("sync.disabledCategories"); }
  private eligible(record: { collection: string; id: string }): boolean { return isEnabled(record.collection, record.id, this.disabled()); }
  private dirty(limit = SYNC_MAX_RECORDS): EntityRecord<unknown>[] {
    const out: EntityRecord<unknown>[] = [];
    // Page over excluded rows too: a disabled category must never starve enabled records.
    for (let offset = 0; out.length < limit; offset += 200) {
      const rows = this.ctx.db.all<{ collection: string; id: string }>("SELECT collection, id FROM entities WHERE sync_dirty = 1 ORDER BY updated_at, collection, id LIMIT 200 OFFSET ?", offset);
      for (const row of rows) {
        if (!this.eligible(row)) continue;
        const record = this.ctx.entities.get(row.collection, row.id, { includeDeleted: true });
        if (record) out.push(record);
        if (out.length === limit) break;
      }
      if (rows.length < 200) break;
    }
    return out;
  }
  status(): SyncStatus {
    const counts: Record<string, number> = Object.fromEntries(SYNC_CATEGORIES.map(c => [c.id, 0]));
    counts.always = 0;
    let pendingChanges = 0;
    for (const row of this.ctx.db.all<{ collection: string; id: string; deleted: number; sync_dirty: number }>("SELECT collection, id, deleted, sync_dirty FROM entities")) {
      const category = categoryFor(row.collection, row.id);
      if (category && !row.deleted) counts[category] = (counts[category] ?? 0) + 1;
      if (row.sync_dirty && this.eligible(row)) pendingChanges++;
    }
    const last = Number(this.getState("lastSyncedAt"));
    return { phase: this.phase, serverUrl: this.ctx.settings.get("sync.serverUrl") ?? undefined, deviceId: this.deviceId(),
      deviceName: this.ctx.settings.get("sync.deviceName") || hostname(), lastSyncedAt: last || undefined, lastError: this.lastError, pendingChanges, counts };
  }
  private emit(): SyncStatus { const status = this.status(); this.ctx.events.emit("sync.status", status); return status; }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.lifecycle.then(fn);
    this.lifecycle = next.then(() => {}, () => {});
    return next;
  }
  async ready(): Promise<void> {
    this.deviceId();
    this.unlisten.push(this.ctx.entities.onChange(change => {
      if (change.source !== "local" || !this.eligible(change) || !this.session) return;
      this.emit();
      clearTimeout(this.localTimer);
      this.localTimer = setTimeout(() => this.trigger(), 2000);
      this.localTimer.unref();
    }));
    this.unlisten.push(this.ctx.native.on("system.didWake", () => this.trigger()));
    this.unlisten.push(this.ctx.settings.onChange(key => {
      if (key === "sync.intervalSeconds" && this.session && !this.running) this.schedule();
      if (key === "sync.disabledCategories" && this.session) {
        this.replayGeneration++;
        this.setState("cursor", "0");
        this.trigger();
      }
    }));
    if (!this.ctx.settings.get("sync.enabled")) { this.emit(); return; }
    await this.exclusive(async () => {
      const serverUrl = this.ctx.settings.get("sync.serverUrl");
      const [token, vmk] = await Promise.all([this.ctx.secrets.get("sync:token"), this.ctx.secrets.get("sync:vmk")]);
      const vaultId = this.getState("vaultId"), keyEpoch = Number(this.getState("keyEpoch"));
      if (!serverUrl || !token || !vmk || !vaultId || !keyEpoch) { this.phase = "needs-passphrase"; this.emit(); return; }
      try {
        const controller = new AbortController();
        const key = decode(vmk, 32);
        const keys = deriveKeys(key, vaultId); key.fill(0);
        this.session = { controller, keys, vault: { vaultId, keyEpoch }, http: new SyncHttp(normalizeServerUrl(serverUrl), token, this.deviceId(), controller.signal) };
        this.phase = "connecting";
        this.trigger();
        this.openSocket();
      } catch { this.phase = "needs-passphrase"; this.lastError = "Stored sync credentials are unavailable; reconnect with the passphrase"; this.emit(); }
    });
  }
  connect(options: ConnectOptions): Promise<SyncStatus> {
    return this.exclusive(async () => {
      const serverUrl = normalizeServerUrl(options.serverUrl);
      if (typeof options.token !== "string" || !options.token.length || options.token.length > 4096 || /[\r\n]/.test(options.token)) throw new Error("A valid sync server token is required");
      if (options.deviceName !== undefined && (!options.deviceName.trim() || options.deviceName.length > 256 || /[\u0000-\u001f]/.test(options.deviceName))) throw new Error("Invalid sync device name");
      await this.stop();
      this.ctx.settings.set("sync.enabled", false);
      this.phase = "connecting"; this.lastError = undefined; this.emit();
      const controller = new AbortController();
      const http = new SyncHttp(serverUrl, options.token, this.deviceId(), controller.signal);
      let vmk: Buffer | undefined;
      try {
        const health = await http.request<{ ok: boolean; version: number }>("/v1/health");
        if (health.ok !== true || health.version !== 1) throw new Error("Unsupported sync server version");
        const deviceName = options.deviceName?.trim() || this.ctx.settings.get("sync.deviceName") || hostname();
        const register = () => http.request("/v1/devices", "POST", { deviceId: this.deviceId(), name: deviceName, platform: process.platform, appVersion: this.ctx.version });
        const fetchVault = async () => {
          try { return await http.request("/v1/vault"); }
          catch (e) {
            if (!(e instanceof SyncHttpError) || e.code !== "device_revoked") throw e;
            // Only an explicit connect may re-register; automatic resume cannot undo revocation.
            await register();
            return http.request("/v1/vault");
          }
        };
        let vault: SyncVault;
        try { vault = validateVault(await fetchVault()); vmk = await unwrapVault(vault, options.passphrase); }
        catch (e) {
          if (!(e instanceof SyncHttpError) || e.status !== 404) throw e;
          const created = await createVault(options.passphrase); vault = created.vault; vmk = created.vmk;
          try { await http.request("/v1/vault", "PUT", vault); }
          catch (race) {
            if (!(race instanceof SyncHttpError) || race.status !== 409) throw race;
            vmk.fill(0); vault = validateVault(await http.request("/v1/vault")); vmk = await unwrapVault(vault, options.passphrase);
          }
        }
        await register();
        await this.ctx.secrets.set("sync:vmk", vmk.toString("base64url"));
        await this.ctx.secrets.set("sync:token", options.token);
        this.ctx.settings.set("sync.serverUrl", serverUrl);
        this.ctx.settings.set("sync.deviceName", deviceName);
        this.ctx.db.transaction(() => {
          this.setState("vaultId", vault.vaultId); this.setState("keyEpoch", String(vault.keyEpoch)); this.setState("cursor", "0");
          this.ctx.entities.markAllDirty();
        });
        this.session = { controller, http, vault, keys: deriveKeys(vmk, vault.vaultId) };
        this.ctx.settings.set("sync.enabled", true);
        this.phase = "initial-sync"; this.emit();
        const status = await this.now();
        this.openSocket();
        return status;
      } catch (e) {
        controller.abort();
        this.phase = e instanceof Error && e.message === "Wrong passphrase" ? "needs-passphrase" : "error";
        this.lastError = e instanceof SyncHttpError ? e.message : e instanceof Error && ["Wrong passphrase", "Unsupported sync server version", "Passphrase must contain 1–4096 characters", "Unsupported sync vault format"].includes(e.message) ? e.message : "Unable to connect to sync server";
        this.emit();
        throw new Error(this.lastError);
      } finally { vmk?.fill(0); }
    });
  }
  private async stop(): Promise<void> {
    const old = this.session; this.session = undefined;
    old?.controller.abort();
    clearTimeout(this.timer); clearTimeout(this.localTimer); clearTimeout(this.socketTimer);
    this.socket?.terminate(); this.socket = undefined;
    await this.running?.catch(() => {});
    old?.keys.encKey.fill(0); old?.keys.ridKey.fill(0);
    this.failures = 0; this.socketFailures = 0; this.rerun = false;
  }
  disconnect(forgetKeys = false): Promise<void> {
    return this.exclusive(async () => {
      await this.stop(); this.ctx.settings.set("sync.enabled", false);
      if (forgetKeys) { await this.ctx.secrets.delete("sync:vmk"); await this.ctx.secrets.delete("sync:token"); }
      this.phase = "disabled"; this.lastError = undefined; this.emit();
    });
  }
  async shutdown(): Promise<void> { await this.lifecycle; await this.stop(); for (const unsubscribe of this.unlisten) unsubscribe(); }
  private trigger(): void {
    if (!this.session) return;
    if (this.running) { this.rerun = true; return; }
    void this.now();
  }
  now(): Promise<SyncStatus> {
    if (this.running) return this.running;
    const session = this.session;
    if (!session) return Promise.resolve(this.status());
    clearTimeout(this.timer);
    this.running = this.cycle(session).catch(error => {
      if (this.session !== session || session.controller.signal.aborted) return this.status();
      this.failures++;
      this.phase = error instanceof SyncHttpError && ["vault_not_found", "vault_changed"].includes(error.code) ? "needs-passphrase" : error instanceof SyncNetworkError ? "offline" : "error";
      this.lastError = error instanceof SyncHttpError ? error.message : "Sync failed; check the connection and encrypted record integrity";
      return this.emit();
    }).finally(() => {
      this.running = undefined;
      if (this.session === session) {
        if (this.rerun && !this.failures) { this.rerun = false; this.timer = setTimeout(() => this.trigger(), 0); this.timer.unref(); }
        else this.schedule();
      }
    });
    return this.running;
  }
  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.session || this.phase === "needs-passphrase" || (this.phase === "error" && this.lastError?.includes("device was removed"))) return;
    const configured = this.ctx.settings.get("sync.intervalSeconds");
    const delay = this.failures ? Math.min(300000, 2000 * 2 ** Math.min(this.failures - 1, 8)) : Math.max(5, Number.isFinite(configured) ? configured : 300) * 1000;
    this.timer = setTimeout(() => this.trigger(), delay); this.timer.unref();
  }
  private assertSession(session: Session): void { if (this.session !== session || session.controller.signal.aborted) throw new Error("Sync session stopped"); }
  private async cycle(session: Session): Promise<SyncStatus> {
    const remoteVault = validateVault(await session.http.request("/v1/vault"));
    this.assertSession(session);
    if (remoteVault.vaultId !== session.vault.vaultId || remoteVault.keyEpoch !== session.vault.keyEpoch) throw new SyncHttpError(409, "vault_changed");
    await this.pull(session);
    for (let attempt = 0; attempt < 1000; attempt++) {
      const dirty = this.dirty();
      if (!dirty.length) break;
      const records: SyncPushRecord[] = [], originals: EntityRecord<unknown>[] = [];
      let bytes = 16;
      for (const record of dirty) {
        const encrypted = encryptRecord(session.keys, session.vault, { v: 1, collection: record.collection, id: record.id,
          createdAt: record.createdAt, updatedAt: record.updatedAt, deleted: record.deleted, data: record.data }, record.syncSeq);
        const size = Buffer.byteLength(JSON.stringify(encrypted)) + 1;
        if (bytes + size > SYNC_MAX_REQUEST_BYTES) break;
        records.push(encrypted); originals.push(record); bytes += size;
      }
      let response: { results: SyncPushResult[] };
      try { response = await session.http.request("/v1/push", "POST", { records }, { "If-Match": session.vault.vaultId }); }
      catch (e) {
        if (e instanceof SyncHttpError && e.code === "record_missing") {
          this.ctx.db.transaction(() => {
            for (const record of originals) this.ctx.db.run("UPDATE entities SET sync_seq = NULL WHERE collection = ? AND id = ? AND updated_at = ?", record.collection, record.id, record.updatedAt);
            this.setState("cursor", "0");
          });
          await this.pull(session); continue;
        }
        throw e;
      }
      this.assertSession(session);
      if (!Array.isArray(response.results) || response.results.length !== records.length) throw new Error("Invalid sync push response");
      this.ctx.db.transaction(() => {
        for (let i = 0; i < records.length; i++) {
          const result = response.results[i], original = originals[i];
          if (result.rid !== records[i].rid) throw new Error("Invalid sync push identity");
          if (result.status === "ok" && Number.isSafeInteger(result.seq) && result.seq > 0) this.ctx.entities.markSynced(original.collection, original.id, result.seq, original.updatedAt);
          else if (result.status === "conflict" && result.current?.rid === result.rid) {
            const remote = decryptRecord(session.keys, session.vault, result.current);
            if (this.eligible(remote)) applyRemote(this.ctx.entities, remote, result.current.seq);
          } else throw new Error("Invalid sync push result");
        }
      });
      // Re-pull after each batch to catch concurrent edits and advance the durable cursor.
      await this.pull(session);
      if (attempt === 999) this.rerun = true;
    }
    this.ctx.entities.purgeTombstones(Date.now() - 30 * 86400000);
    this.setState("lastSyncedAt", String(Date.now()));
    this.phase = "online"; this.lastError = undefined; this.failures = 0;
    return this.emit();
  }
  private async pull(session: Session): Promise<void> {
    while (true) {
      const generation = this.replayGeneration;
      const cursor = Number(this.getState("cursor") ?? 0);
      const page = await session.http.request<SyncPullPage>(`/v1/pull?after=${cursor}&limit=200`);
      this.assertSession(session);
      if (generation !== this.replayGeneration) continue;
      if (!Array.isArray(page.records) || page.records.length > 1000 || !Number.isSafeInteger(page.cursor) || page.cursor < cursor || typeof page.hasMore !== "boolean") throw new Error("Invalid sync pull response");
      let previous = cursor;
      const decoded = page.records.map(record => {
        if (record.seq <= previous || record.seq > page.cursor) throw new Error("Invalid sync sequence ordering");
        previous = record.seq;
        return { payload: decryptRecord(session.keys, session.vault, record), seq: record.seq };
      });
      if ((page.records.length && previous !== page.cursor) || (!page.records.length && (page.cursor !== cursor || page.hasMore))) throw new Error("Invalid sync cursor");
      this.ctx.db.transaction(() => {
        for (const record of decoded) if (this.eligible(record.payload)) applyRemote(this.ctx.entities, record.payload, record.seq);
        this.setState("cursor", String(page.cursor));
      });
      if (!page.hasMore) return;
    }
  }
  private openSocket(): void {
    const session = this.session;
    if (!session || this.socket || this.phase === "needs-passphrase") return;
    const url = new URL(session.http.serverUrl + "/v1/events"); url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, { headers: session.http.headers(), followRedirects: false, handshakeTimeout: 30000, maxPayload: 1024 });
    this.socket = socket;
    let pollingOnly = false;
    socket.on("open", () => { this.socketFailures = 0; this.trigger(); });
    socket.on("message", data => {
      try { const message = JSON.parse(data.toString()); if (message.type === "changed" && Number.isSafeInteger(message.seq)) this.trigger(); } catch {}
    });
    socket.on("unexpected-response", (_req, response) => { pollingOnly = response.statusCode === 501 || response.statusCode === 403 || response.statusCode === 401; response.resume(); socket.terminate(); });
    socket.on("error", () => {});
    socket.on("close", code => {
      if (this.socket === socket) this.socket = undefined;
      if (this.session !== session) return;
      if (code === 4003) { this.trigger(); return; }
      if (pollingOnly) return;
      this.socketFailures++;
      this.socketTimer = setTimeout(() => this.openSocket(), Math.min(300000, 2000 * 2 ** Math.min(this.socketFailures - 1, 8)));
      this.socketTimer.unref();
    });
  }
  async devices(): Promise<SyncDevice[]> {
    const session = this.requireSession();
    const devices = await session.http.request<Omit<SyncDevice, "current">[]>("/v1/devices");
    if (!Array.isArray(devices)) throw new Error("Invalid sync device list");
    return devices.map(device => ({ ...device, current: device.deviceId === this.deviceId() }));
  }
  async removeDevice(deviceId: string): Promise<void> {
    await this.requireSession().http.request(`/v1/devices/${encodeURIComponent(deviceId)}`, "DELETE");
    if (deviceId === this.deviceId()) await this.disconnect(false);
  }
  setCategoryEnabled(category: string, enabled: boolean): void {
    if (!SYNC_CATEGORIES.some(c => c.id === category) || typeof enabled !== "boolean") throw new Error("Unknown sync category or invalid enabled flag");
    const disabled = new Set(this.disabled());
    if (enabled) disabled.delete(category); else disabled.add(category);
    this.ctx.settings.set("sync.disabledCategories", [...disabled]);
    if (enabled) {
      this.replayGeneration++;
      this.setState("cursor", "0");
    }
    this.trigger(); this.emit();
  }
  wipeRemote(confirm: string): Promise<void> {
    return this.exclusive(async () => {
      if (confirm !== "wipe") throw new Error('Confirm remote deletion with "wipe"');
      const session = this.requireSession();
      const token = await this.ctx.secrets.get("sync:token");
      if (!token) throw new Error("Sync token is unavailable");
      const http = new SyncHttp(session.http.serverUrl, token, this.deviceId(), new AbortController().signal);
      await this.stop();
      this.ctx.settings.set("sync.enabled", false);
      this.phase = "disabled"; this.emit();
      await http.request("/v1/vault", "DELETE", undefined, { "X-Surgecast-Confirm": "wipe" });
      await this.ctx.secrets.delete("sync:vmk"); await this.ctx.secrets.delete("sync:token");
      this.setState("cursor", "0"); this.phase = "disabled"; this.lastError = undefined; this.emit();
    });
  }
  private requireSession(): Session { if (!this.session) throw new Error("Cloud Sync is disconnected"); return this.session; }
}
