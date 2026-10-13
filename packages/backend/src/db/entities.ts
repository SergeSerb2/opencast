import type { Database, Migration } from "./database";
import { monotonicNow, observeTimestamp } from "../util/ids";

/**
 * Generic document store for user content that can sync (snippets, quicklinks,
 * notes, AI chats, presets, settings, ...). One row per (collection, id) with a
 * JSON payload. Deletes are tombstones so they can sync; the sync engine purges
 * old tombstones after they reached the server.
 *
 * Conventions:
 * - `updatedAt` is a monotonic ms timestamp; last writer wins on sync.
 * - `syncDirty` is set by every local write and cleared by `markSynced`.
 * - Collections listed in LOCAL_ONLY_COLLECTIONS never sync.
 */

export const entitiesMigration: Migration = {
  id: "core-001-entities",
  up: `
    CREATE TABLE entities (
      collection TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      sync_seq INTEGER,
      sync_dirty INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (collection, id)
    );
    CREATE INDEX entities_collection_updated ON entities (collection, deleted, updated_at DESC);
    CREATE INDEX entities_dirty ON entities (sync_dirty) WHERE sync_dirty = 1;
  `,
};

export interface EntityRecord<T> {
  collection: string;
  id: string;
  data: T;
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  syncSeq: number | null;
  syncDirty: boolean;
}

export interface EntityChange {
  collection: string;
  id: string;
  kind: "put" | "delete";
  /** "local" = this device's user action, "sync" = applied from another device. */
  source: "local" | "sync";
}

interface Row {
  collection: string;
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
  deleted: number;
  sync_seq: number | null;
  sync_dirty: number;
}

export const LOCAL_ONLY_COLLECTIONS = new Set<string>(["localState"]);

function toRecord<T>(row: Row): EntityRecord<T> {
  return {
    collection: row.collection,
    id: row.id,
    data: JSON.parse(row.data) as T,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
    syncSeq: row.sync_seq,
    syncDirty: row.sync_dirty === 1,
  };
}

export interface ListOptions {
  includeDeleted?: boolean;
  /** Default "updated" (newest first). */
  orderBy?: "updated" | "created";
  limit?: number;
  offset?: number;
}

export class EntityStore {
  private readonly listeners = new Set<(change: EntityChange) => void>();

  constructor(private readonly db: Database) {}

  get<T>(collection: string, id: string, options?: { includeDeleted?: boolean }): EntityRecord<T> | undefined {
    const row = this.db.get<Row>("SELECT * FROM entities WHERE collection = ? AND id = ?", collection, id);
    if (!row || (row.deleted && !options?.includeDeleted)) return undefined;
    return toRecord<T>(row);
  }

  list<T>(collection: string, options: ListOptions = {}): EntityRecord<T>[] {
    const order = options.orderBy === "created" ? "created_at" : "updated_at";
    const rows = this.db.all<Row>(
      `SELECT * FROM entities WHERE collection = ? ${options.includeDeleted ? "" : "AND deleted = 0"}
       ORDER BY ${order} DESC LIMIT ? OFFSET ?`,
      collection,
      options.limit ?? -1,
      options.offset ?? 0,
    );
    return rows.map((r) => toRecord<T>(r));
  }

  count(collection: string): number {
    return this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM entities WHERE collection = ? AND deleted = 0", collection)?.n ?? 0;
  }

  /** Insert or replace the payload. Marks the row dirty for sync. */
  put<T>(collection: string, id: string, data: T, options?: { createdAt?: number }): EntityRecord<T> {
    const now = monotonicNow();
    const existing = this.db.get<Row>("SELECT created_at FROM entities WHERE collection = ? AND id = ?", collection, id);
    const createdAt = existing?.created_at ?? options?.createdAt ?? now;
    this.db.run(
      `INSERT INTO entities (collection, id, data, created_at, updated_at, deleted, sync_dirty)
       VALUES (?, ?, ?, ?, ?, 0, 1)
       ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted = 0, sync_dirty = 1`,
      collection,
      id,
      JSON.stringify(data),
      createdAt,
      now,
    );
    this.notify({ collection, id, kind: "put", source: "local" });
    return this.get<T>(collection, id)!;
  }

  /** Shallow-merge `patch` into the current payload. Throws if missing. */
  patch<T extends object>(collection: string, id: string, patch: Partial<T>): EntityRecord<T> {
    const current = this.get<T>(collection, id);
    if (!current) throw new Error(`${collection}/${id} not found`);
    return this.put<T>(collection, id, { ...current.data, ...patch });
  }

  /** Tombstone. The payload is cleared so deleted content does not linger. */
  delete(collection: string, id: string): boolean {
    const r = this.db.run(
      "UPDATE entities SET deleted = 1, data = '{}', updated_at = ?, sync_dirty = 1 WHERE collection = ? AND id = ? AND deleted = 0",
      monotonicNow(),
      collection,
      id,
    );
    if (r.changes > 0) this.notify({ collection, id, kind: "delete", source: "local" });
    return r.changes > 0;
  }

  onChange(listener: (change: EntityChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ---- sync engine API ------------------------------------------------------

  /** Dirty rows of syncable collections, oldest first. */
  dirty(limit = 500): EntityRecord<unknown>[] {
    return this.db
      .all<Row>("SELECT * FROM entities WHERE sync_dirty = 1 ORDER BY updated_at ASC LIMIT ?", limit * 2)
      .filter((r) => !LOCAL_ONLY_COLLECTIONS.has(r.collection))
      .slice(0, limit)
      .map((r) => toRecord(r));
  }

  /** Clear the dirty flag if nothing changed locally since the pushed version. */
  markSynced(collection: string, id: string, seq: number, pushedUpdatedAt: number): void {
    this.db.run(
      "UPDATE entities SET sync_seq = ?, sync_dirty = CASE WHEN updated_at = ? THEN 0 ELSE sync_dirty END WHERE collection = ? AND id = ?",
      seq,
      pushedUpdatedAt,
      collection,
      id,
    );
  }

  /**
   * Apply a record from the server. Last writer wins by `updatedAt`; ties keep
   * the local copy. Returns "applied" or "stale" (local is newer and stays dirty).
   */
  applyRemote(
    collection: string,
    id: string,
    remote: { data: unknown; createdAt: number; updatedAt: number; deleted: boolean },
    seq: number,
  ): "applied" | "stale" {
    observeTimestamp(remote.updatedAt);
    const local = this.db.get<Row>("SELECT * FROM entities WHERE collection = ? AND id = ?", collection, id);
    if (local && local.sync_dirty === 1 && local.updated_at >= remote.updatedAt) {
      this.db.run("UPDATE entities SET sync_seq = ? WHERE collection = ? AND id = ?", seq, collection, id);
      return "stale";
    }
    this.db.run(
      `INSERT INTO entities (collection, id, data, created_at, updated_at, deleted, sync_seq, sync_dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at,
         updated_at = excluded.updated_at, deleted = excluded.deleted, sync_seq = excluded.sync_seq, sync_dirty = 0`,
      collection,
      id,
      remote.deleted ? "{}" : JSON.stringify(remote.data),
      remote.createdAt,
      remote.updatedAt,
      remote.deleted ? 1 : 0,
      seq,
    );
    this.notify({ collection, id, kind: remote.deleted ? "delete" : "put", source: "sync" });
    return "applied";
  }

  /** Remove tombstones that the server already has and that are older than `olderThan` ms epoch. */
  purgeTombstones(olderThan: number): number {
    return this.db.run("DELETE FROM entities WHERE deleted = 1 AND sync_dirty = 0 AND updated_at < ?", olderThan).changes;
  }

  /** Mark everything dirty again (first sync against a new server). */
  markAllDirty(): void {
    this.db.run("UPDATE entities SET sync_dirty = 1, sync_seq = NULL");
  }

  private notify(change: EntityChange): void {
    for (const l of this.listeners) l(change);
  }
}
