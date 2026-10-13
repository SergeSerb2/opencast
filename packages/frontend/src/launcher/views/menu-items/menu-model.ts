import type { KeyboardShortcut, KeyModifier, MenuItemInfo } from "@opencast/protocol";
import { fuzzyFilter, type MatchRange } from "../../../lib/fuzzy";

/** A pressable menu item (leaf) with display data. */
export interface MenuEntry {
  /** Stable key: the path joined with U+0000. */
  id: string;
  item: MenuItemInfo;
  /** Top-level menu ("File", "Edit"…). */
  menu: string;
  /** Path without the item itself, e.g. "File → Share". */
  pathLabel: string;
  shortcut?: KeyboardShortcut;
}

export interface MenuSection {
  id: string;
  title: string;
  /** Item count. */
  subtitle: string;
  entries: (MenuEntry & { titleRanges?: MatchRange[] })[];
}

const pathKey = (path: string[]) => path.join("\u0000");

const MODIFIER_GLYPHS: Record<string, KeyModifier> = { "⌃": "ctrl", "⌥": "opt", "⇧": "shift", "⌘": "cmd" };
const KEY_GLYPHS: Record<string, string> = {
  "⇥": "tab",
  "⌫": "delete",
  "⌦": "deleteForward",
  "↩": "return",
  "↵": "return",
  "⎋": "escape",
  "←": "arrowLeft",
  "→": "arrowRight",
  "↑": "arrowUp",
  "↓": "arrowDown",
  space: "space",
};

/** "⌥⇧⌘V" (as the host reports menu shortcuts) → keycaps model. */
export function parseMenuShortcut(text: string | undefined): KeyboardShortcut | undefined {
  if (!text) return undefined;
  const modifiers: KeyModifier[] = [];
  let index = 0;
  while (index < text.length && MODIFIER_GLYPHS[text[index]]) {
    const modifier = MODIFIER_GLYPHS[text[index]];
    if (!modifiers.includes(modifier)) modifiers.push(modifier);
    index += 1;
  }
  const rest = text.slice(index).trim();
  if (!rest) return undefined;
  const key = KEY_GLYPHS[rest] ?? KEY_GLYPHS[rest.toLowerCase()] ?? (rest.length === 1 ? rest.toLowerCase() : rest);
  return { modifiers, key };
}

/**
 * Pressable items in menu-bar order: submenu parents (which the
 * Accessibility API lists alongside their children) and duplicates dropped.
 */
export function menuEntries(items: MenuItemInfo[]): MenuEntry[] {
  const parents = new Set<string>();
  for (const item of items) for (let length = 1; length < item.path.length; length++) parents.add(pathKey(item.path.slice(0, length)));
  const seen = new Set<string>();
  const entries: MenuEntry[] = [];
  for (const item of items) {
    const id = pathKey(item.path);
    if (!item.title.trim() || parents.has(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, item, menu: item.path.length > 1 ? item.path[0] : item.title, pathLabel: item.path.slice(0, -1).join(" → "), shortcut: parseMenuShortcut(item.shortcut) });
  }
  return entries;
}

/**
 * Sections for the list: one per top-level menu, or a single ranked
 * "Results" section while searching (title matches above path matches).
 */
export function menuSections(entries: MenuEntry[], query: string): MenuSection[] {
  if (query.trim()) {
    const hits = fuzzyFilter(entries, query.trim(), (entry) => [
      { text: entry.item.title, highlight: true },
      { text: entry.pathLabel, weight: 0.6 },
    ]);
    if (!hits.length) return [];
    return [{ id: "results", title: "Results", subtitle: String(hits.length), entries: hits.map((hit) => ({ ...hit.item, titleRanges: hit.ranges })) }];
  }
  const byMenu = new Map<string, MenuEntry[]>();
  for (const entry of entries) byMenu.set(entry.menu, [...(byMenu.get(entry.menu) ?? []), entry]);
  return [...byMenu].map(([menu, list]) => ({ id: `menu:${menu}`, title: menu, subtitle: String(list.length), entries: list }));
}
