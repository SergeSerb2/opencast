import type { AIProvider, MCPServer } from "@opencast/protocol";
import type { Database } from "../../db/database";
import type { EntityRecord, EntityStore } from "../../db/entities";
import { monotonicNow, observeTimestamp } from "../../util/ids";
import { secretHash, type SecretChange, type SecretsService } from "../secrets";
import type { SyncPayload } from "./crypto";

export const SECRET_COLLECTION = "syncedSecrets";
const webProviders = ["tavily", "brave", "exa", "searxng", "jina"];
const controls = /[\u0000-\u001f\u007f-\u009f]/;
// Values may span lines (for example a PEM key in an MCP environment variable).
const valueControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const header = "[!#$%&'*+.^_`|~0-9A-Za-z-]+";
const providerAccount = new RegExp(`^ai\\.provider:[^:]+:(?:apiKey|header:${header})$`);
const mcpAccount = new RegExp(`^mcp:[^:]+:(?:env:[A-Za-z_][A-Za-z0-9_]*|header:${header})$`);

export function isSecretAccount(account: string): boolean {
  return account.length <= 256 && !controls.test(account) && (providerAccount.test(account) || mcpAccount.test(account) ||
    webProviders.some(provider => account === `ai.websearch:${provider}:apiKey`));
}
function isSecretValue(value: unknown): value is string {
  return typeof value === "string" && Buffer.byteLength(value) <= 64 * 1024 && !valueControls.test(value);
}
interface Row {
  account: string;
  created_at: number;
  updated_at: number;
  deleted: number;
  sync_seq: number | null;
  sync_dirty: number;
  value_hash: string | null;
}
export interface SecretRecord extends EntityRecord<undefined> { valueHash: string | null }

/** Only metadata reaches SQLite. Values pass directly between Keychain and encryption. */
export class SecretSync {
  constructor(private readonly db: Database, private readonly entities: EntityStore, private readonly secrets: SecretsService) {
    db.addMigrations({ id: "sync-002-secret-state", up: `
      CREATE TABLE sync_secret_state (
        account TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        sync_seq INTEGER,
        sync_dirty INTEGER NOT NULL DEFAULT 1,
        value_hash TEXT
      );
    ` });
  }
  private get(account: string): Row | undefined { return this.db.get<Row>("SELECT * FROM sync_secret_state WHERE account = ?", account); }
  changed(change: SecretChange): boolean {
    if (change.source !== "local" || !isSecretAccount(change.account)) return false;
    const now = monotonicNow();
    this.db.run(`INSERT INTO sync_secret_state (account, created_at, updated_at, deleted, value_hash)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(account) DO UPDATE SET updated_at = excluded.updated_at,
      deleted = excluded.deleted, value_hash = excluded.value_hash, sync_dirty = 1`,
    change.account, now, now, change.deleted ? 1 : 0, change.valueHash);
    return true;
  }
  private accounts(): Set<string> {
    const accounts = new Set(webProviders.map(provider => `ai.websearch:${provider}:apiKey`));
    for (const { id, data } of this.entities.list<AIProvider>("aiProviders")) {
      accounts.add(`ai.provider:${id}:apiKey`);
      for (const name of data.secretHeaders ?? []) accounts.add(`ai.provider:${id}:header:${name}`);
    }
    for (const { id, data } of this.entities.list<MCPServer>("mcpServers"))
      for (const [kind, values] of [["env", data.env], ["header", data.headers]] as const)
        for (const [name, value] of Object.entries(values ?? {}))
          if (value === "$keychain") accounts.add(`mcp:${id}:${kind}:${name}`);
    return accounts;
  }
  async collect(): Promise<void> {
    for (const account of this.accounts()) {
      if (!isSecretAccount(account)) continue;
      await this.secrets.withLock(async secrets => {
        const value = await secrets.get(account, { fresh: true });
        // Absence is not a deletion. Only an explicit successful delete makes a tombstone.
        if (value === null || !isSecretValue(value)) return;
        const hash = secretHash(value), local = this.get(account);
        if (!local || local.deleted || local.value_hash !== hash)
          this.changed({ account, deleted: false, valueHash: hash, source: "local" });
      });
    }
  }
  rows(): Row[] { return this.db.all<Row>("SELECT * FROM sync_secret_state ORDER BY updated_at, account"); }
  dirty(): SecretRecord[] {
    return this.rows().filter(row => row.sync_dirty && isSecretAccount(row.account)).map(row => ({
      collection: SECRET_COLLECTION, id: row.account, data: undefined, createdAt: row.created_at, updatedAt: row.updated_at,
      deleted: row.deleted === 1, syncSeq: row.sync_seq, syncDirty: true, valueHash: row.value_hash,
    }));
  }
  async payload(record: SecretRecord): Promise<SyncPayload | undefined> {
    if (!isSecretAccount(record.id)) return;
    return this.secrets.withLock(async secrets => {
      const local = this.get(record.id);
      if (!local || local.updated_at !== record.updatedAt || local.value_hash !== record.valueHash || Boolean(local.deleted) !== record.deleted) return;
      if (record.deleted) return { v: 1, collection: SECRET_COLLECTION, id: record.id, createdAt: record.createdAt,
        updatedAt: record.updatedAt, deleted: true, data: { v: 1 } };
      const value = await secrets.get(record.id, { fresh: true });
      if (value === null || !isSecretValue(value)) return;
      const hash = secretHash(value);
      if (hash !== record.valueHash) {
        this.changed({ account: record.id, deleted: false, valueHash: hash, source: "local" });
        return;
      }
      return { v: 1, collection: SECRET_COLLECTION, id: record.id, createdAt: record.createdAt,
        updatedAt: record.updatedAt, deleted: false, data: { v: 1, value } };
    });
  }
  async apply(remote: SyncPayload, seq: number, eligible: () => boolean): Promise<void> {
    if (remote.collection !== SECRET_COLLECTION || !isSecretAccount(remote.id)) return;
    const data = remote.data as { v?: unknown; value?: unknown } | null;
    if (!data || data.v !== 1 || (remote.deleted ? Object.keys(data).some(key => key !== "v") : !isSecretValue(data.value))) return;
    const value = remote.deleted ? null : data.value as string;
    await this.secrets.withLock(async secrets => {
      if (!eligible()) return;
      observeTimestamp(remote.updatedAt);
      const local = this.get(remote.id);
      if (local?.sync_dirty && local.updated_at >= remote.updatedAt) {
        this.db.run("UPDATE sync_secret_state SET sync_seq = ? WHERE account = ?", seq, remote.id);
        return;
      }
      if (value === null) await secrets.delete(remote.id, "sync");
      else await secrets.set(remote.id, value, "sync");
      this.db.run(`INSERT INTO sync_secret_state (account, created_at, updated_at, deleted, sync_seq, sync_dirty, value_hash)
        VALUES (?, ?, ?, ?, ?, 0, ?) ON CONFLICT(account) DO UPDATE SET created_at = excluded.created_at,
        updated_at = excluded.updated_at, deleted = excluded.deleted, sync_seq = excluded.sync_seq, sync_dirty = 0, value_hash = excluded.value_hash`,
      remote.id, remote.createdAt, remote.updatedAt, remote.deleted ? 1 : 0, seq, value === null ? null : secretHash(value));
    });
  }
  markSynced(record: SecretRecord, seq: number): void {
    this.db.run(`UPDATE sync_secret_state SET sync_seq = ?, sync_dirty = CASE
      WHEN updated_at = ? AND value_hash IS ? AND deleted = ? THEN 0 ELSE sync_dirty END WHERE account = ?`,
    seq, record.updatedAt, record.valueHash, record.deleted ? 1 : 0, record.id);
  }
  resetSeq(record: SecretRecord): void {
    this.db.run("UPDATE sync_secret_state SET sync_seq = NULL WHERE account = ? AND updated_at = ?", record.id, record.updatedAt);
  }
  markAllDirty(): void { this.db.run("UPDATE sync_secret_state SET sync_dirty = 1, sync_seq = NULL"); }
  purgeTombstones(olderThan: number): void {
    this.db.run("DELETE FROM sync_secret_state WHERE deleted = 1 AND sync_dirty = 0 AND updated_at < ?", olderThan);
  }
}
