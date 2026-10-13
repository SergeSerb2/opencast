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
export function isEnabled(collection: string, id: string, disabled: readonly string[]): boolean {
  const category = categoryFor(collection, id);
  return category !== undefined && (category === "always" || !disabled.includes(category));
}
