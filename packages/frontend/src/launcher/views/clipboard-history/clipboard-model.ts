import type { ClipboardItem, ClipboardItemKind } from "@surgecast/protocol";
import { groupByDate } from "../library/format";

export type TypeFilter = ClipboardItemKind | "all";

/** The "Filter by Type" accessory, in Raycast's order. */
export const TYPE_FILTERS: { value: TypeFilter; title: string; icon: string; keywords?: string[] }[] = [
  { value: "all", title: "All Types", icon: "bullet-points-16" },
  { value: "text", title: "Text Only", icon: "text-16" },
  { value: "image", title: "Images Only", icon: "image-16" },
  { value: "file", title: "Files Only", icon: "blank-document-16" },
  { value: "link", title: "Links Only", icon: "link-16", keywords: ["url", "urls", "link", "links"] },
  { value: "color", title: "Colors Only", icon: "eye-dropper-16" },
];

export const KIND_LABEL: Record<ClipboardItemKind, string> = { text: "Text", link: "Link", image: "Image", file: "File", color: "Color" };

/** Pinned first, then Today / Yesterday / This Week / This Month / This Year / Older by last copy. */
export function clipboardSections(items: ClipboardItem[]): { title: string; items: ClipboardItem[] }[] {
  const pinned = items.filter((i) => i.pinned);
  const rest = items.filter((i) => !i.pinned).sort((a, b) => b.lastCopiedAt - a.lastCopiedAt);
  return [...(pinned.length ? [{ title: "Pinned", items: pinned }] : []), ...groupByDate(rest, (i) => i.lastCopiedAt)];
}

export const PREVIEW_LINES = 15;

/** First lines of a text entry for the preview, and how many characters were left out. */
export function textPreview(text: string, maxLines = PREVIEW_LINES): { text: string; hiddenCharacters: number } {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return { text, hiddenCharacters: 0 };
  const shown = lines.slice(0, maxLines).join("\n");
  return { text: shown, hiddenCharacters: [...text].length - [...shown].length };
}

/** Plain-text content of a text-like entry. */
export function entryText(item: ClipboardItem): string {
  return item.text ?? item.url ?? item.color ?? item.title;
}

export const isTextLike = (item: ClipboardItem) => item.kind === "text" || item.kind === "link" || item.kind === "color";
export const isMailto = (item: ClipboardItem) => item.kind === "link" && /^mailto:/i.test(item.url ?? "");

/** Local path of a file or image entry, if any. */
export function entryPath(item: ClipboardItem): string | undefined {
  if (item.kind === "file") return item.filePaths?.[0];
  if (item.kind === "image" && item.imagePath?.startsWith("/")) return item.imagePath;
  return undefined;
}

/** Pretty-printed JSON when the text parses as an object or array. */
export function formattedJson(text: string): string | null {
  const trimmed = text.trim();
  if (!/^[[{]/.test(trimmed)) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

/** Suggested name for "Save as File…": the first three words joined with dashes. */
export function suggestedFileName(text: string): string {
  const words = text.match(/[\p{L}\p{N}]+/gu)?.slice(0, 3) ?? [];
  return words.length ? `${words.join("-")}.txt` : "Untitled.txt";
}

/** Name for "Save as Snippet": the first line, shortened. */
export function suggestedSnippetName(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? "";
  return line.length > 40 ? `${line.slice(0, 40).trimEnd()}…` : line;
}

export const RECENT_RANGES: { title: string; minutes: number }[] = [
  { title: "Last 5 Minutes", minutes: 5 },
  { title: "Last 15 Minutes", minutes: 15 },
  { title: "Last 30 Minutes", minutes: 30 },
  { title: "Last Hour", minutes: 60 },
  { title: "Last 24 Hours", minutes: 24 * 60 },
];

/** Unpinned entries copied within the last `minutes` (pinned entries are kept, like Raycast). */
export function entriesSince(items: ClipboardItem[], minutes: number, now = Date.now()): ClipboardItem[] {
  const cutoff = now - minutes * 60_000;
  return items.filter((i) => !i.pinned && i.lastCopiedAt >= cutoff);
}
