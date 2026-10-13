import type { CommandPrefs } from "@opencast/protocol";
import type { AppContext } from "../context";

export const VERSION_COMMAND_ID = "builtin:core.copyOpenCastVersion";
export const LEGACY_VERSION_COMMAND_ID = "builtin:core.copySurgecastVersion";

/** Preserve preferences and ranking independently, before commands become active. */
export function migrateVersionCommandState(ctx: AppContext): void {
  const legacy = ctx.entities.get<CommandPrefs>("commandPrefs", LEGACY_VERSION_COMMAND_ID);
  const visit = ctx.db.get<{ count: number; last_used: number }>(
    "SELECT count, last_used FROM command_frecency WHERE id = ?", LEGACY_VERSION_COMMAND_ID);
  if (!legacy && !visit) return;
  ctx.db.transaction(() => {
    if (visit) {
      const currentVisit = ctx.db.get<{ count: number; last_used: number }>(
        "SELECT count, last_used FROM command_frecency WHERE id = ?", VERSION_COMMAND_ID);
      ctx.db.run(`INSERT INTO command_frecency (id, count, last_used) VALUES (?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET count = excluded.count, last_used = excluded.last_used`,
        VERSION_COMMAND_ID, visit.count + (currentVisit?.count ?? 0),
        Math.max(visit.last_used, currentVisit?.last_used ?? 0));
      ctx.db.run("DELETE FROM command_frecency WHERE id = ?", LEGACY_VERSION_COMMAND_ID);
    }
    if (legacy) {
      const current = ctx.entities.get<CommandPrefs>("commandPrefs", VERSION_COMMAND_ID);
      ctx.entities.put("commandPrefs", VERSION_COMMAND_ID, { ...legacy.data, ...current?.data }, {
        createdAt: current?.createdAt ?? legacy.createdAt,
      });
      // A tombstone prevents the fallback from restoring explicitly unset fields.
      ctx.entities.delete("commandPrefs", LEGACY_VERSION_COMMAND_ID);
    }
  });
}

/** Only persisted identifiers that changed with the OpenCast name. */
export function currentSettingKey(key: string): string {
  return key === "developer.openSurgecastInDevelopmentMode"
    ? "developer.openOpenCastInDevelopmentMode" : key;
}

export function currentThemeId(value: unknown): unknown {
  return typeof value === "string" && /^surgecast-(dark|light|sky|midnight|dawn)$/.test(value)
    ? value.replace(/^surgecast-/, "opencast-") : value;
}

export function currentSettingValue(key: string, value: unknown): unknown {
  return key === "general.themeDark" || key === "general.themeLight" ? currentThemeId(value) : value;
}
