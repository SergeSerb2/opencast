import type { AIChat, AIChatFolder } from "@opencast/protocol";

export interface TimeGroup {
  /** Undefined for today's chats, which sit directly under "Recent". */
  label?: string;
  chats: AIChat[];
}

export interface SidebarGroups {
  pinned: AIChat[];
  folders: { folder: AIChatFolder; chats: AIChat[] }[];
  recent: TimeGroup[];
  archived: AIChat[];
}

const DAY = 86_400_000;

function startOfDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** "Yesterday", "Previous 7 Days", … relative to `now`; undefined for today. */
export function timeGroupLabel(timestamp: number, now: number): string | undefined {
  const today = startOfDay(now);
  if (timestamp >= today) return undefined;
  if (timestamp >= today - DAY) return "Yesterday";
  if (timestamp >= today - 7 * DAY) return "Previous 7 Days";
  if (timestamp >= today - 30 * DAY) return "Previous 30 Days";
  return "Older";
}

const byRecency = (a: AIChat, b: AIChat) => b.updatedAt - a.updatedAt;

/**
 * Sidebar layout: pinned chats, one section per folder, then the remaining
 * chats bucketed by last activity. Archived chats are listed separately.
 */
export function groupChats(chats: readonly AIChat[], folders: readonly AIChatFolder[], now: number): SidebarGroups {
  const live = chats.filter((c) => !c.archived);
  const folderIds = new Set(folders.map((f) => f.id));
  const pinned = live.filter((c) => c.pinned).sort(byRecency);
  const unpinned = live.filter((c) => !c.pinned);
  const inFolder = (c: AIChat) => Boolean(c.folderId && folderIds.has(c.folderId));
  const recent: TimeGroup[] = [];
  for (const chat of unpinned.filter((c) => !inFolder(c)).sort(byRecency)) {
    const label = timeGroupLabel(chat.updatedAt, now);
    const last = recent[recent.length - 1];
    if (last && last.label === label) last.chats.push(chat);
    else recent.push({ label, chats: [chat] });
  }
  return {
    pinned,
    folders: [...folders].sort((a, b) => a.name.localeCompare(b.name)).map((folder) => ({ folder, chats: unpinned.filter((c) => c.folderId === folder.id).sort(byRecency) })),
    recent,
    archived: chats.filter((c) => c.archived).sort(byRecency),
  };
}

/** Chats in sidebar order (for ⌘↑/⌘↓ navigation and selecting a neighbour after delete). */
export function flattenGroups(groups: SidebarGroups, collapsed: ReadonlySet<string> = new Set()): AIChat[] {
  return [
    ...(collapsed.has("pinned") ? [] : groups.pinned),
    ...groups.folders.flatMap((f) => (collapsed.has(`folder:${f.folder.id}`) ? [] : f.chats)),
    ...(collapsed.has("recent") ? [] : groups.recent.flatMap((g) => g.chats)),
  ];
}
