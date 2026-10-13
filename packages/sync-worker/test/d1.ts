import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import type { Env } from "../src/handler";

/** Execute the production SQL, including transactional batch semantics, against SQLite. */
export function createTestEnv(): Env & { close(): void; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8"));
  class Statement {
    constructor(readonly sql: string, readonly args: (string | number | null)[] = []) {}
    bind(...args: (string | number | null)[]) { return new Statement(this.sql, args); }
    execute() {
      const stmt = sqlite.prepare(this.sql);
      const results = stmt.columns().length ? stmt.all(...this.args) : [];
      const meta = results.length ? { changes: results.length } : stmt.columns().length ? { changes: 0 } : { changes: Number(stmt.run(...this.args).changes) };
      return { results, meta, success: true };
    }
    async all() { return this.execute(); }
    async run() { return this.execute(); }
    async first(column?: string) { const row = this.execute().results[0]; return row ? (column ? row[column] : row) : null; }
  }
  const db = {
    prepare(sql: string) { return new Statement(sql); },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try { const result = statements.map(s => s.execute()); sqlite.exec("COMMIT"); return result; }
      catch (e) { sqlite.exec("ROLLBACK"); throw e; }
    },
  };
  return { DB: db as unknown as Env["DB"], SYNC_TOKEN: "test-token", SYNC_TOKENS: "other:other-token", sqlite, close: () => sqlite.close() };
}
