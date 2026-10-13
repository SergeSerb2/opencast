/**
 * Pure text helpers for Notes: titles, counters, relative times and the
 * "is this pasted text Markdown?" heuristic.
 */

export const UNTITLED = "Untitled";

/** Title shown for a note: the first line of its first block, trimmed (§7.2, Raycast's rule). */
export function titleFromText(text: string): string {
  return text.split("\n", 1)[0]?.trim() || UNTITLED;
}

/** Private-use offset for characters escaped with a backslash. */
const ESCAPED = 0xe000;
const BLOCK_PREFIX = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+(?:\[[ xX]\]\s+)?)/;

/**
 * Plain title for a stored first Markdown line (backend titles keep list and
 * quote markers and inline syntax): "- [ ] **Buy** milk" → "Buy milk".
 */
export function plainTitle(line: string): string {
  // Hide escaped characters from the syntax rules below, restore them at the end.
  let text = (line.split(/\r?\n/, 1)[0] ?? "").replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, (_, ch: string) => String.fromCharCode(ESCAPED + ch.charCodeAt(0)));
  for (let previous = ""; previous !== text;) {
    previous = text;
    text = text.replace(BLOCK_PREFIX, "");
  }
  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__|~~|\+\+)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\s](?:.*?[^*_\s])?)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/[\ue000-\ue0ff]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - ESCAPED));
  return text.trim() || UNTITLED;
}

const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const words = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "word" }) : null;

/** User-perceived characters of the trimmed text (emoji and combining marks count once). */
export function countCharacters(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return graphemes ? Array.from(graphemes.segment(trimmed)).length : [...trimmed].length;
}

/** Word-like segments of the trimmed text (CJK aware through Intl.Segmenter). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (!words) return trimmed.split(/\s+/u).length;
  return Array.from(words.segment(trimmed)).filter((segment) => segment.isWordLike).length;
}

export function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

const UNITS: [limit: number, seconds: number, unit: string][] = [
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [7 * 86400, 86400, "day"],
  [30 * 86400, 7 * 86400, "week"],
  [365 * 86400, 30 * 86400, "month"],
  [Infinity, 365 * 86400, "year"],
];

/** "just now", "1 minute ago", "32 minutes ago", "1 month ago" (note browser subtitles). */
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  for (const [limit, size, unit] of UNITS) {
    if (seconds < limit) return `${pluralize(Math.floor(seconds / size), unit)} ago`;
  }
  return "a long time ago";
}

const MARKDOWN_SIGNALS = [
  /^#{1,6}\s+\S/m, // heading
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // task
  /^\s*[-*+]\s+\S/m, // bullet
  /^\s*\d+[.)]\s+\S/m, // ordered
  /^\s*>\s?\S/m, // quote
  /^\s*(```|~~~)/m, // fence
  /^\s*([-*_])(\s*\1){2,}\s*$/m, // rule
  /\[[^\]]+\]\([^)\s]+\)/, // link
  /(\*\*|__|~~)\S(.*?\S)?\1/, // strong / strike
  /`[^`\n]+`/, // inline code
];

/**
 * Whether pasted plain text should be parsed as Markdown. Ordinary prose stays
 * plain so its line breaks become paragraphs instead of being reflowed.
 */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_SIGNALS.some((signal) => signal.test(text));
}
