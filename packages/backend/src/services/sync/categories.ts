import { ALWAYS_SYNCED_COLLECTIONS, SETTINGS, SYNC_CATEGORIES, isSettingsKey } from "@opencast/protocol";

/** undefined means device-local or an unknown collection; deny by default. */
export function categoryFor(collection: string, id: string): string | undefined {
  if (collection === "settings") {
    if (!isSettingsKey(id) || SETTINGS[id].scope !== "synced") return undefined;
    return SETTINGS[id].category ?? "always";
  }
  if ((ALWAYS_SYNCED_COLLECTIONS as readonly string[]).includes(collection)) return "always";
  return SYNC_CATEGORIES.find(c => (c.collections as readonly string[]).includes(collection))?.id;
}
export function isOptIn(category: string): boolean {
  return SYNC_CATEGORIES.some(c => c.id === category && "optIn" in c && c.optIn);
}
/** Regular categories sync unless disabled; opt-in categories sync only when turned on. */
export function isCategoryEnabled(category: string, disabled: readonly string[], optedIn: readonly string[] = []): boolean {
  return category === "always" || (isOptIn(category) ? optedIn.includes(category) : !disabled.includes(category));
}
export function isEnabled(collection: string, id: string, disabled: readonly string[], optedIn: readonly string[] = []): boolean {
  const category = categoryFor(collection, id);
  return category !== undefined && isCategoryEnabled(category, disabled, optedIn);
}
