import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "../util/log";

const log = createLogger("db");

export interface Migration {
  /** Globally unique, e.g. "core-001-entities". Applied in registration order. */
  id: string;
  up: string | ((db: Database) => void);
}

type Param = null | number | bigint | string | NodeJS.ArrayBufferView;

/**
 * Thin wrapper over node:sqlite with a statement cache, transactions and a
 * migration runner. Services register their migrations at startup; `migrate()`
 * applies the ones not yet recorded in `_migrations`.
 */
export class Database {
  readonly raw: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();
  private readonly migrations: Migration[] = [];
  private txDepth = 0;
  private commitHooks: (() => void)[][] = [];

  constructor(readonly path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.raw = new DatabaseSync(path);
    this.raw.exec("PRAGMA journal_mode = WAL");
    this.raw.exec("PRAGMA synchronous = NORMAL");
    this.raw.exec("PRAGMA foreign_keys = ON");
    this.raw.exec("PRAGMA busy_timeout = 5000");
    this.raw.exec("CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)");
  }

  addMigrations(...migrations: Migration[]): void {
    for (const m of migrations) {
      if (this.migrations.some((x) => x.id === m.id)) throw new Error(`Duplicate migration id ${m.id}`);
      this.migrations.push(m);
    }
  }

  migrate(): void {
    const applied = new Set(this.all<{ id: string }>("SELECT id FROM _migrations").map((r) => r.id));
    for (const m of this.migrations) {
      if (applied.has(m.id)) continue;
      this.transaction(() => {
        if (typeof m.up === "string") this.raw.exec(m.up);
        else m.up(this);
        this.run("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)", m.id, Date.now());
      });
      log.info(`applied migration ${m.id}`);
    }
  }

  prepare(sql: string): StatementSync {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.raw.prepare(sql);
      this.statements.set(sql, stmt);
    }
    return stmt;
  }

  run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
    const r = this.prepare(sql).run(...params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get<T>(sql: string, ...params: Param[]): T | undefined {
    return this.prepare(sql).get(...params) as T | undefined;
  }

  all<T>(sql: string, ...params: Param[]): T[] {
    return this.prepare(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /** Nested calls join the outer transaction (savepoints). */
  transaction<T>(fn: () => T): T {
    const savepoint = `sp_${this.txDepth}`;
    this.raw.exec(this.txDepth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    this.txDepth++;
    this.commitHooks.push([]);
    let result: T;
    try {
      result = fn();
      this.raw.exec(this.txDepth === 1 ? "COMMIT" : `RELEASE ${savepoint}`);
    } catch (error) {
      this.raw.exec(this.txDepth === 1 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`);
      this.commitHooks.pop();
      this.txDepth--;
      throw error;
    }
    const hooks = this.commitHooks.pop()!;
    this.txDepth--;
    if (this.txDepth) this.commitHooks[this.txDepth - 1].push(...hooks);
    else for (const hook of hooks) hook();
    return result;
  }

  /** Side effects run only after the outer transaction commits. */
  afterCommit(fn: () => void): void {
    if (this.txDepth) this.commitHooks[this.txDepth - 1].push(fn);
    else fn();
  }

  close(): void {
    this.statements.clear();
    this.raw.close();
  }
}
