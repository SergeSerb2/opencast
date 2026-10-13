/**
 * Formatting shared by the content views (clipboard, snippets, quicklinks,
 * files, notes, calculator history).
 */

const DAY = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Monday-based start of the week, like macOS in most locales Raycast ships for. */
function startOfWeek(date: Date): number {
  const day = (date.getDay() + 6) % 7;
  return startOfDay(date) - day * DAY;
}

export type DateSection = "Today" | "Yesterday" | "This Week" | "This Month" | "This Year" | "Older";

const SECTION_ORDER: DateSection[] = ["Today", "Yesterday", "This Week", "This Month", "This Year", "Older"];

/** History section for a timestamp: Today, Yesterday, This Week, This Month, This Year, Older. */
export function dateSection(timestamp: number, now: Date = new Date()): DateSection {
  const today = startOfDay(now);
  if (timestamp >= today) return "Today";
  if (timestamp >= today - DAY) return "Yesterday";
  if (timestamp >= startOfWeek(now)) return "This Week";
  if (timestamp >= new Date(now.getFullYear(), now.getMonth(), 1).getTime()) return "This Month";
  if (timestamp >= new Date(now.getFullYear(), 0, 1).getTime()) return "This Year";
  return "Older";
}

/** Group items into date sections in display order (items keep their relative order). */
export function groupByDate<T>(items: T[], time: (item: T) => number, options: { now?: Date; thisYear?: boolean } = {}): { title: DateSection; items: T[] }[] {
  const groups = new Map<DateSection, T[]>();
  for (const item of items) {
    let title = dateSection(time(item), options.now);
    if (title === "This Year" && options.thisYear === false) title = "Older";
    const bucket = groups.get(title);
    if (bucket) bucket.push(item);
    else groups.set(title, [item]);
  }
  return SECTION_ORDER.filter((title) => groups.has(title)).map((title) => ({ title, items: groups.get(title)! }));
}

/**
 * Medium date and time with a relative day word nearby, as Raycast's metadata:
 * "Today, 10:24:05 AM", "Yesterday, 9:05:12 PM", "Jan 5, 2026, 9:03:07 AM".
 */
export function formatTimestamp(timestamp: number, now: Date = new Date()): string {
  const date = new Date(timestamp);
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY);
  if (Math.abs(days) <= 1) {
    const word = days === 0 ? "Today" : days === -1 ? "Yesterday" : "Tomorrow";
    return `${word}, ${date.toLocaleTimeString(undefined, { timeStyle: "medium" })}`;
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

/** Decimal byte count: "912 bytes", "182 kB", "2.5 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1000) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, "")} ${units[unit]}`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** Last path component without a trailing slash. */
export function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "/";
}

/** The path with the user's home folder shown as "~". */
export function tildePath(path: string, home?: string): string {
  const userHome = home ?? /^\/Users\/[^/]+/.exec(path)?.[0];
  return userHome && (path === userHome || path.startsWith(`${userHome}/`)) ? `~${path.slice(userHome.length)}` : path;
}

/** Parent directory with the home folder shown as "~". */
export function displayDirectory(path: string, home?: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return tildePath(trimmed.slice(0, trimmed.lastIndexOf("/")) || "/", home);
}

/** Name for a duplicated item: "Name Copy", "Name Copy 2", … */
export function copyName(name: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const base = `${name} Copy`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}
