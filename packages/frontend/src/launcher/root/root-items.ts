import type { RootSearchItem, RootSearchResult } from "@surgecast/protocol";
import type { ListAccessory, ListItemModel, ListSectionModel } from "../../components/List/model";

export const CALCULATOR_ID = "calculator";
export const FALLBACK_PREFIX = "fallback:";

/** Root rows carry their command so actions can be built for the selection. */
export interface RootRow {
  item: RootSearchItem;
  /** Row is a fallback ("Use “query” with…") — runs with the query as fallback text. */
  fallback: boolean;
}

/** Right-side accessories of a root row: alias, hotkey (apps: only when selected), type label last. */
export function rootAccessories(item: RootSearchItem): ListAccessory[] {
  const accessories: ListAccessory[] = [];
  if (item.alias) accessories.push({ alias: item.alias });
  if (item.hotkey) accessories.push({ shortcut: { modifiers: item.hotkey.modifiers, key: item.hotkey.key }, onlyWhenSelected: item.kind === "app" });
  for (const extra of item.accessories ?? []) {
    if (extra.text || extra.icon) accessories.push({ text: extra.text, icon: extra.icon, tooltip: extra.tooltip });
  }
  accessories.push({ text: item.typeLabel });
  return accessories;
}

function toListItem(item: RootSearchItem, fallback: boolean): ListItemModel {
  return {
    id: fallback ? `${FALLBACK_PREFIX}${item.id}` : item.id,
    title: item.title,
    subtitle: item.kind === "app" ? undefined : item.subtitle,
    icon: item.icon,
    titleRanges: fallback ? undefined : item.matches,
    accessories: rootAccessories(item),
    iconDot: item.running ? "default" : undefined,
    disabled: !item.enabled,
  };
}

/**
 * Turn a `search.root` result into list sections (calculator card first, then
 * the backend's sections, then "Use “query” with…" fallbacks) and an index of
 * rows by list id.
 */
export function buildRootSections(result: RootSearchResult | undefined, query: string): { sections: ListSectionModel[]; rows: Map<string, RootRow> } {
  const sections: ListSectionModel[] = [];
  const rows = new Map<string, RootRow>();
  if (!result) return { sections, rows };
  if (result.calculator) sections.push({ id: "calculator", title: "Calculator", items: [{ id: CALCULATOR_ID, title: result.calculator.result, height: 124 }] });
  for (const section of result.sections) {
    const items = section.items.map((item) => {
      rows.set(item.id, { item, fallback: false });
      return toListItem(item, false);
    });
    sections.push({ id: section.id, title: section.title, items });
  }
  if (query.trim() && result.fallbacks.length) {
    const items = result.fallbacks.map((item) => {
      rows.set(`${FALLBACK_PREFIX}${item.id}`, { item, fallback: true });
      return toListItem(item, true);
    });
    sections.push({ id: "use-with", title: `Use “${query.trim()}” with…`, items });
  }
  return { sections, rows };
}

/** Deeplink for a command, mirroring Raycast's `raycast://extensions/<owner>/<extension>/<command>`. */
export function commandDeeplink(item: Pick<RootSearchItem, "id" | "kind" | "extensionId">): string {
  const [kind, rest] = [item.id.slice(0, item.id.indexOf(":")), item.id.slice(item.id.indexOf(":") + 1)];
  if (kind === "builtin" || kind === "ext") {
    const [extension, command] = rest.split(".");
    const owner = kind === "builtin" ? "surgecast" : (item.extensionId ?? extension);
    return `surgecast://extensions/${encodeURIComponent(owner)}/${encodeURIComponent(extension)}/${encodeURIComponent(command ?? "")}`;
  }
  return `surgecast://commands/${encodeURIComponent(item.id)}`;
}
