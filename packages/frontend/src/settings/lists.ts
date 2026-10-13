/** Copy of `list` with the item at `from` moved to index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return [...list];
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Format a byte count as "12.3 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return unit === 0 ? `${value} ${value === 1 ? "byte" : "bytes"}` : `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** "5 minutes ago", "Yesterday", or a date, for last-sync and last-seen times. */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(timestamp).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" });
}

/** Display a path with the home folder as "~". */
export function tildePath(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}
