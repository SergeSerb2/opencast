import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { environment } from "./environment";

type Subscriber = (key: string | undefined, value: string | undefined) => void;
const stores = new Map<string, DatabaseSync>();
const listeners = new Map<string, Set<Subscriber>>();
/** Synchronous local cache, shared by all commands of an extension. Never synced. */
export class Cache {
  static STORAGE_DIRECTORY_NAME = "com.opencast.api.cache";
  static DEFAULT_CAPACITY = 10_000_000;
  readonly storageDirectory: string;
  private readonly db: DatabaseSync;
  private readonly namespace: string;
  private readonly capacity: number;
  private readonly listenerKey: string;
  constructor(options: { directory?: string; namespace?: string; capacity?: number } = {}) {
    const directory = options.directory ?? environment.supportPath;
    const current = join(directory, Cache.STORAGE_DIRECTORY_NAME);
    const legacy = join(directory, "com.surgecast.api.cache");
    this.storageDirectory = !existsSync(current) && existsSync(legacy) ? legacy : current;
    mkdirSync(this.storageDirectory, { recursive: true });
    const path = join(this.storageDirectory, "cache.sqlite");
    let db = stores.get(path);
    if (!db) {
      db = new DatabaseSync(path);
      db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS cache (namespace TEXT, key TEXT, value TEXT NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY(namespace,key))");
      stores.set(path, db);
    }
    this.db = db;
    this.namespace = options.namespace ?? "";
    this.capacity = options.capacity ?? Cache.DEFAULT_CAPACITY;
    if (!Number.isFinite(this.capacity) || this.capacity < 0) throw new Error("Cache capacity must be a nonnegative number");
    this.listenerKey = `${path}\0${this.namespace}`;
    // @raycast/utils passes subscribe directly to useSyncExternalStore.
    for (const method of ["get", "has", "set", "remove", "clear", "subscribe"] as const) this[method] = this[method].bind(this) as any;
  }
  get(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM cache WHERE namespace=? AND key=?").get(this.namespace, key) as { value: string } | undefined;
    if (row) this.db.prepare("UPDATE cache SET touched=(SELECT COALESCE(MAX(touched),0)+1 FROM cache) WHERE namespace=? AND key=?").run(this.namespace, key);
    return row?.value;
  }
  has(key: string): boolean { return Boolean(this.db.prepare("SELECT 1 FROM cache WHERE namespace=? AND key=?").get(this.namespace, key)); }
  get isEmpty(): boolean { return !this.db.prepare("SELECT 1 FROM cache WHERE namespace=? LIMIT 1").get(this.namespace); }
  set(key: string, value: string): void {
    if (typeof value !== "string") throw new Error("Cache values must be strings");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("INSERT INTO cache VALUES (?, ?, ?, (SELECT COALESCE(MAX(touched),0)+1 FROM cache)) ON CONFLICT(namespace,key) DO UPDATE SET value=excluded.value,touched=excluded.touched").run(this.namespace, key, value);
      const rows = this.db.prepare("SELECT key, length(CAST(value AS BLOB)) AS size FROM cache WHERE namespace=? ORDER BY touched DESC").all(this.namespace) as { key: string; size: number }[];
      let size = 0;
      for (const row of rows) { size += row.size; if (size > this.capacity) this.db.prepare("DELETE FROM cache WHERE namespace=? AND key=?").run(this.namespace, row.key); }
      this.db.exec("COMMIT");
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
    this.emit(key, value);
  }
  remove(key: string): boolean {
    const removed = this.db.prepare("DELETE FROM cache WHERE namespace=? AND key=?").run(this.namespace, key).changes > 0;
    if (removed) this.emit(key, undefined);
    return removed;
  }
  clear(options: { notifySubscribers?: boolean } = {}): void {
    this.db.prepare("DELETE FROM cache WHERE namespace=?").run(this.namespace);
    if (options.notifySubscribers !== false) this.emit(undefined, undefined);
  }
  subscribe(subscriber: Subscriber): () => void {
    const set = listeners.get(this.listenerKey) ?? new Set<Subscriber>();
    listeners.set(this.listenerKey, set);
    set.add(subscriber);
    return () => { set.delete(subscriber); if (!set.size) listeners.delete(this.listenerKey); };
  }
  private emit(key: string | undefined, value: string | undefined): void { for (const fn of listeners.get(this.listenerKey) ?? []) fn(key, value); }
}
