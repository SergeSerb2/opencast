const MIGRATION_KEY = "opencast.storageMigration.v1";

/** Copy legacy preferences before window modules read their initial state. */
export function migrateLegacyStorage(storage: Storage): void {
  try {
    if (storage.getItem(MIGRATION_KEY) === "done") return;
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
    for (const key of keys) {
      if (!key || !/^surgecast[.-]/.test(key)) continue;
      const current = key.replace(/^surgecast/, "opencast");
      if (storage.getItem(current) !== null) continue;
      const value = storage.getItem(key);
      if (value !== null) storage.setItem(current, value);
    }
    // Keep old keys for rollback, and do not restore removed preferences on later boots.
    storage.setItem(MIGRATION_KEY, "done");
  } catch {
    // Retry next boot if storage is unavailable or a write fails.
  }
}

try { migrateLegacyStorage(globalThis.localStorage); } catch { /* storage unavailable */ }
