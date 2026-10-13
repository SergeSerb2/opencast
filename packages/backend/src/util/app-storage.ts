import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Reuse existing data in place so stored file paths and SQLite WAL files stay valid. */
export function defaultDataDirectory(dev: boolean, home = homedir()): string {
  const root = join(home, "Library", "Application Support");
  const suffix = dev ? "-Dev" : "";
  const current = join(root, `OpenCast${suffix}`);
  const legacy = join(root, `Surgecast${suffix}`);
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}

export function databasePath(directory: string): string {
  const current = join(directory, "opencast.db");
  const legacy = join(directory, "surgecast.db");
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
