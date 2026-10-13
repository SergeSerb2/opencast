import type { Appearance as AppearanceSetting } from "@surgecast/protocol";
import { setSetting } from "../../../bridge/settings";

type ThemeAppearance = "dark" | "light";

export interface ThemeSettingsUpdate {
  "general.themeDark"?: string;
  "general.themeLight"?: string;
  "general.appearance"?: AppearanceSetting;
}

/**
 * Settings to write when the user picks a theme.
 * - "current": show it now. The appearance is pinned to the theme's, unless it
 *   already follows the system and the system shows that appearance.
 * - "appearance": make it the theme for its appearance and leave the appearance alone.
 */
export function themeSettingsUpdate(themeId: string, themeAppearance: ThemeAppearance, mode: "current" | "appearance", appearanceSetting: AppearanceSetting, shownAppearance: ThemeAppearance): ThemeSettingsUpdate {
  const update: ThemeSettingsUpdate = themeAppearance === "dark" ? { "general.themeDark": themeId } : { "general.themeLight": themeId };
  if (mode === "current" && !(appearanceSetting === "system" && shownAppearance === themeAppearance) && appearanceSetting !== themeAppearance) {
    update["general.appearance"] = themeAppearance;
  }
  return update;
}

/** Writes all keys together (each write is optimistic, so the window switches in one render). */
export async function applyThemeSettings(update: ThemeSettingsUpdate): Promise<void> {
  const writes: Promise<void>[] = [];
  if (update["general.themeDark"] !== undefined) writes.push(setSetting("general.themeDark", update["general.themeDark"]));
  if (update["general.themeLight"] !== undefined) writes.push(setSetting("general.themeLight", update["general.themeLight"]));
  if (update["general.appearance"] !== undefined) writes.push(setSetting("general.appearance", update["general.appearance"]));
  await Promise.all(writes);
}
