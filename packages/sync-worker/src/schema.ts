/// <reference path="./sql.d.ts" />
import type { D1Database } from "@cloudflare/workers-types";
import schema from "../migrations/0001_init.sql?raw";

// One promise per database binding in this isolate. Concurrent requests share it.
const initialized = new WeakMap<D1Database, Promise<void>>();
export function ensureSchema(db: D1Database): Promise<void> {
  let ready = initialized.get(db);
  if (!ready) {
    // The migration contains only semicolon-separated CREATE statements.
    ready = db.batch(schema.split(";").map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)))
      .then(() => {})
      .catch(error => { initialized.delete(db); throw error; });
    initialized.set(db, ready);
  }
  return ready;
}
