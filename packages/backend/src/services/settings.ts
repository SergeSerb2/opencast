import {
  SETTINGS,
  defaultSettings,
  isSettingsKey,
  type SettingsKey,
  type SettingValue,
  type SettingsValues,
} from "@opencast/protocol";
import type { Database, Migration } from "../db/database";
import type { EntityStore } from "../db/entities";
import type { EventBus } from "../events";
import { RpcError } from "../util/errors";
import { currentSettingKey, currentSettingValue } from "../util/legacy-branding";

/**
 * Settings live in two places:
 * - synced settings: EntityStore collection "settings", one entity per key (`{ value }`),
 *   so Cloud Sync merges them key by key;
 * - device settings: the local `device_settings` table.
 * Unset keys fall back to the defaults in protocol/settings.ts.
 */

export const settingsMigration: Migration = {
  id: "core-002-device-settings",
  up: "CREATE TABLE device_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
};

export class SettingsService {
  private readonly listeners = new Set<(key: SettingsKey, value: unknown) => void>();

  constructor(
    private readonly db: Database,
    private readonly entities: EntityStore,
    private readonly events: EventBus,
  ) {
    entities.onChange((change) => {
      if (change.collection !== "settings" || change.source !== "sync" || !isSettingsKey(change.id)) return;
      this.notify(change.id, this.get(change.id));
    });
  }

  get<K extends SettingsKey>(key: K): SettingValue<K> {
    const def = SETTINGS[key];
    if (def.scope === "device") {
      const row = this.db.get<{ value: string }>("SELECT value FROM device_settings WHERE key = ?", key)
        ?? (key === "developer.openOpenCastInDevelopmentMode"
          ? this.db.get<{ value: string }>("SELECT value FROM device_settings WHERE key = ?", "developer.openSurgecastInDevelopmentMode") : undefined);
      return row ? (JSON.parse(row.value) as SettingValue<K>) : structuredClone(def.default as SettingValue<K>);
    }
    const rec = this.entities.get<{ value: SettingValue<K> }>("settings", key);
    return rec ? currentSettingValue(key, rec.data.value) as SettingValue<K> : structuredClone(def.default as SettingValue<K>);
  }

  getAll(): SettingsValues {
    const out = defaultSettings() as Record<string, unknown>;
    for (const rec of this.entities.list<{ value: unknown }>("settings")) {
      if (isSettingsKey(rec.id) && SETTINGS[rec.id].scope === "synced") out[rec.id] = currentSettingValue(rec.id, rec.data.value);
    }
    const rows = this.db.all<{ key: string; value: string }>("SELECT key, value FROM device_settings");
    for (const row of rows) {
      const key = currentSettingKey(row.key);
      if (key !== row.key && rows.some(r => r.key === key)) continue;
      if (isSettingsKey(key)) out[key] = JSON.parse(row.value);
    }
    return out as SettingsValues;
  }

  set<K extends SettingsKey>(key: K, value: SettingValue<K>): void {
    if (!isSettingsKey(key)) throw RpcError.invalidParams(`Unknown setting ${String(key)}`);
    if (value === undefined) throw RpcError.invalidParams(`Setting ${key} needs a value`);
    if (SETTINGS[key].scope === "device") {
      this.db.run(
        "INSERT INTO device_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        key,
        JSON.stringify(value),
      );
    } else {
      this.entities.put("settings", key, { value });
    }
    this.notify(key, value);
  }

  reset(key: SettingsKey): void {
    if (key === "developer.openOpenCastInDevelopmentMode")
      this.db.run("DELETE FROM device_settings WHERE key = ?", "developer.openSurgecastInDevelopmentMode");
    if (SETTINGS[key].scope === "device") this.db.run("DELETE FROM device_settings WHERE key = ?", key);
    else this.entities.delete("settings", key);
    this.notify(key, this.get(key));
  }

  onChange(listener: (key: SettingsKey, value: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(key: SettingsKey, value: unknown): void {
    this.db.afterCommit(() => {
      for (const l of this.listeners) l(key, value);
      this.events.emit("settings.changed", { key, value });
    });
  }
}
