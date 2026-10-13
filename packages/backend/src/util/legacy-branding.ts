import type { CommandPrefs } from "@opencast/protocol";
import type { AppContext } from "../context";

export const VERSION_COMMAND_ID = "builtin:core.copyOpenCastVersion";
export const LEGACY_VERSION_COMMAND_ID = "builtin:core.copySurgecastVersion";

/** Materialize all old fields before partial edits, unsets, or favorite reordering. */
export function migrateVersionCommandPrefs(ctx: AppContext): void {
  const legacy = ctx.entities.get<CommandPrefs>("commandPrefs", LEGACY_VERSION_COMMAND_ID);
  if (!legacy) return;
  const current = ctx.entities.get<CommandPrefs>("commandPrefs", VERSION_COMMAND_ID);
  ctx.db.transaction(() => {
    ctx.entities.put("commandPrefs", VERSION_COMMAND_ID, { ...legacy.data, ...current?.data }, {
      createdAt: current?.createdAt ?? legacy.createdAt,
    });
    // A tombstone prevents the fallback from restoring explicitly unset fields.
    ctx.entities.delete("commandPrefs", LEGACY_VERSION_COMMAND_ID);
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
