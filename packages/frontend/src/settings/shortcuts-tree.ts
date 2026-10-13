import type { CommandInfo, CommandKind, ImageLike, InstalledExtension } from "@surgecast/protocol";
import { BUILTIN_PAGES, commandGroup, EXTENSION_FALLBACK_ICON } from "./catalog";

export type ShortcutCategoryId = "applications" | "extensions" | "scripts" | "quicklinks" | "snippets" | "ai" | "window-layouts";
export type ShortcutStateFilter = "all" | "hotkey-set" | "alias-set" | "enabled" | "disabled";

export interface ShortcutFilter {
  query: string;
  category: ShortcutCategoryId | "all";
  state: ShortcutStateFilter;
}

export interface ShortcutGroup {
  /** Command group id (extension name or built-in group). */
  id: string;
  title: string;
  icon: ImageLike;
  /** Settings route for the group's own page, when it has one. */
  route?: string;
  commands: CommandInfo[];
}

export interface ShortcutCategory {
  id: ShortcutCategoryId;
  title: string;
  /** Extensions are grouped by extension; other categories list commands directly. */
  groups?: ShortcutGroup[];
  commands: CommandInfo[];
}

export const CATEGORY_TITLES: Record<ShortcutCategoryId, string> = {
  applications: "Applications",
  extensions: "Extensions",
  scripts: "Script Commands",
  quicklinks: "Quicklinks",
  snippets: "Snippets",
  ai: "AI Commands & Agents",
  "window-layouts": "Window Layouts",
};

const CATEGORY_ORDER: ShortcutCategoryId[] = ["extensions", "applications", "ai", "quicklinks", "snippets", "scripts", "window-layouts"];

const KIND_CATEGORY: Record<CommandKind, ShortcutCategoryId> = {
  builtin: "extensions",
  extension: "extensions",
  app: "applications",
  script: "scripts",
  quicklink: "quicklinks",
  snippet: "snippets",
  "ai-command": "ai",
  "ai-preset": "ai",
  "window-layout": "window-layouts",
};

export function categoryOf(command: Pick<CommandInfo, "kind">): ShortcutCategoryId {
  return KIND_CATEGORY[command.kind] ?? "extensions";
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Every query word must appear in the command's title, group, alias or keywords. */
export function matchesQuery(command: CommandInfo, query: string): boolean {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const haystack = normalize([command.title, command.subtitle, command.extensionTitle, command.alias, command.typeLabel, ...(command.keywords ?? [])].filter(Boolean).join(" "));
  return tokens.every((token) => haystack.includes(token));
}

export function matchesState(command: CommandInfo, state: ShortcutStateFilter): boolean {
  switch (state) {
    case "hotkey-set":
      return Boolean(command.hotkey);
    case "alias-set":
      return Boolean(command.alias);
    case "enabled":
      return command.enabled;
    case "disabled":
      return !command.enabled;
    default:
      return true;
  }
}

/** Checked when all are enabled, unchecked when none, indeterminate when mixed (§8.6). */
export function collectiveState(commands: readonly Pick<CommandInfo, "enabled">[]): boolean | "indeterminate" {
  const enabled = commands.filter((c) => c.enabled).length;
  if (enabled === 0) return false;
  return enabled === commands.length ? true : "indeterminate";
}

function groupFor(id: string, commands: CommandInfo[], extensions: readonly InstalledExtension[]): ShortcutGroup {
  const extension = extensions.find((e) => e.name === id);
  if (extension) return { id, title: extension.title, icon: extension.icon ?? EXTENSION_FALLBACK_ICON, route: `extensions/${extension.name}`, commands };
  const page = BUILTIN_PAGES.find((p) => p.commandGroups?.includes(id));
  const title = commands[0]?.extensionTitle ?? page?.title ?? commands[0]?.subtitle ?? id;
  return { id, title, icon: page?.icon ?? commands[0]?.icon ?? "app-window-grid-2x2-16", route: page?.id, commands };
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

/**
 * Build the Shortcuts tree: categories (Extensions grouped by extension),
 * filtered by search text, category and state. Empty categories and groups
 * are dropped; everything is sorted by title.
 */
export function buildShortcutTree(commands: readonly CommandInfo[], extensions: readonly InstalledExtension[], filter: ShortcutFilter): ShortcutCategory[] {
  const visible = commands.filter((c) => (filter.category === "all" || categoryOf(c) === filter.category) && matchesState(c, filter.state) && matchesQuery(c, filter.query));
  const categories: ShortcutCategory[] = [];
  for (const id of CATEGORY_ORDER) {
    const members = visible.filter((c) => categoryOf(c) === id).sort(byTitle);
    if (!members.length) continue;
    if (id !== "extensions") {
      categories.push({ id, title: CATEGORY_TITLES[id], commands: members });
      continue;
    }
    const grouped = new Map<string, CommandInfo[]>();
    for (const command of members) {
      const key = commandGroup(command) ?? "other";
      grouped.set(key, [...(grouped.get(key) ?? []), command]);
    }
    const groups = [...grouped].map(([key, list]) => groupFor(key, list, extensions)).sort(byTitle);
    categories.push({ id, title: CATEGORY_TITLES[id], groups, commands: members });
  }
  return categories;
}
