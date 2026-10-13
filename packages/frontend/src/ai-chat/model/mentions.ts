import type { AIToolInfo, ImageLike } from "@opencast/protocol";

/** A group of tools the user can enable with an `@mention` (the backend enables tools per toolset). */
export interface Toolset {
  /** "web", "ext:<extension>", "mcp:<serverId>", "builtin" */
  id: string;
  title: string;
  /** Text after "@", e.g. "github". */
  mention: string;
  kind: "web" | "extension" | "mcp" | "builtin";
  icon?: ImageLike;
  tools: AIToolInfo[];
}

export const TOOLSET_KIND_TITLES: Record<Toolset["kind"], string> = {
  web: "Web",
  extension: "Extensions",
  mcp: "MCP Servers",
  builtin: "Built-in",
};

const KIND_ORDER: Toolset["kind"][] = ["web", "extension", "mcp", "builtin"];

function kindOf(toolset: string): Toolset["kind"] {
  if (toolset === "web") return "web";
  if (toolset.startsWith("ext:")) return "extension";
  if (toolset.startsWith("mcp:")) return "mcp";
  return "builtin";
}

/** "Google Calendar" → "google-calendar". */
export function mentionSlug(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tools"
  );
}

/** Group `ai.tools.list` by toolset with unique mention names, ordered web → extensions → MCP → built-in. */
export function toolsetsFromTools(tools: readonly AIToolInfo[]): Toolset[] {
  const byId = new Map<string, Toolset>();
  for (const tool of tools) {
    let set = byId.get(tool.toolset);
    if (!set) {
      set = { id: tool.toolset, title: tool.toolsetTitle, mention: "", kind: kindOf(tool.toolset), icon: tool.icon, tools: [] };
      byId.set(tool.toolset, set);
    }
    set.tools.push(tool);
  }
  const sets = [...byId.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title));
  const used = new Set<string>();
  for (const set of sets) {
    const base = set.kind === "web" ? "web" : mentionSlug(set.title);
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}-${n}`;
    used.add(name);
    set.mention = name;
  }
  return sets;
}

export interface Trigger {
  kind: "@" | "/";
  /** Text typed after the trigger character. */
  query: string;
  /** Index of the trigger character. */
  start: number;
  /** Caret index (end of the query). */
  end: number;
}

/**
 * The `@mention` or `/command` being typed at the caret. A trigger starts at the
 * beginning of the text or after whitespace and runs to the caret without
 * whitespace. `/` only counts at the very start of the message.
 */
export function findTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret);
  const match = /(^|\s)([@/])([^\s@/]*)$/.exec(before);
  if (!match) return null;
  const kind = match[2] as "@" | "/";
  const start = caret - match[3].length - 1;
  if (kind === "/" && before.slice(0, start).trim() !== "") return null;
  return { kind, query: match[3], start, end: caret };
}

/** Replace the trigger with `replacement` (plus a trailing space); returns the new text and caret. */
export function replaceTrigger(text: string, trigger: Trigger, replacement: string): { text: string; caret: number } {
  const after = text.slice(trigger.end);
  const spacer = after.startsWith(" ") ? "" : " ";
  const next = text.slice(0, trigger.start) + replacement + spacer + after;
  return { text: next, caret: trigger.start + replacement.length + 1 };
}

const MENTION = /(^|[\s(])@([a-z0-9][a-z0-9-]*)/gi;

/** Toolsets mentioned anywhere in `text` (case-insensitive), in order of appearance. */
export function mentionedToolsets(text: string, toolsets: readonly Toolset[]): Toolset[] {
  const byMention = new Map(toolsets.map((t) => [t.mention.toLowerCase(), t]));
  const found: Toolset[] = [];
  for (const match of text.matchAll(MENTION)) {
    const set = byMention.get(match[2].toLowerCase());
    if (set && !found.includes(set)) found.push(set);
  }
  return found;
}

export type TextSegment = { text: string; mention?: false } | { text: string; mention: true; toolset: Toolset };

/** Split text into plain runs and known `@mention` tokens (for highlighting in the composer and bubbles). */
export function segmentMentions(text: string, toolsets: readonly Toolset[]): TextSegment[] {
  const byMention = new Map(toolsets.map((t) => [t.mention.toLowerCase(), t]));
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(MENTION)) {
    const toolset = byMention.get(match[2].toLowerCase());
    if (!toolset) continue;
    const start = (match.index ?? 0) + match[1].length;
    const end = start + 1 + match[2].length;
    if (start > last) segments.push({ text: text.slice(last, start) });
    segments.push({ text: text.slice(start, end), mention: true, toolset });
    last = end;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
