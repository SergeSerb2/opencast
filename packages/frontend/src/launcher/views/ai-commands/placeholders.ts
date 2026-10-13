import type { CommandArgument } from "@surgecast/protocol";

/**
 * Dynamic placeholders in AI command prompts. Mirrors the backend parser
 * (services/ai/placeholders.ts) so the editor can validate and highlight
 * prompts before saving, and the list can show argument fields.
 */

export interface PlaceholderOption {
  id: string;
  title: string;
  /** Inserted text; `|` marks where the caret lands (it is not inserted). */
  template: string;
  icon: string;
  section: "Input" | "Browser" | "Context" | "Date & Time";
  keywords?: string[];
}

export const PROMPT_PLACEHOLDERS: PlaceholderOption[] = [
  { id: "selection", title: "Selected Text", template: "{selection}", icon: "text-selection-16", section: "Input", keywords: ["highlighted", "input"] },
  { id: "clipboard", title: "Clipboard Text", template: "{clipboard}", icon: "copy-clipboard-16", section: "Input", keywords: ["copied", "paste"] },
  { id: "argument", title: "Argument", template: '{argument name="|"}', icon: "text-input-16", section: "Input", keywords: ["input", "question", "parameter"] },
  { id: "browser-tab", title: "Browser Tab", template: '{browser-tab format="markdown"}', icon: "globe-01-16", section: "Browser", keywords: ["webpage", "website", "safari", "chrome"] },
  { id: "browser-tab.content", title: "Browser Tab Content", template: '{browser-tab.content format="markdown"}', icon: "blank-document-16", section: "Browser", keywords: ["webpage", "text"] },
  { id: "browser-tab.url", title: "Browser Tab URL", template: "{browser-tab.url}", icon: "link-16", section: "Browser", keywords: ["address", "link"] },
  { id: "browser-tab.title", title: "Browser Tab Title", template: "{browser-tab.title}", icon: "text-16", section: "Browser" },
  { id: "focused-app", title: "Frontmost Application", template: "{focused-app}", icon: "app-window-16", section: "Context", keywords: ["app", "active"] },
  { id: "snippet", title: "Snippet", template: '{snippet name="|"}', icon: "snippets-16", section: "Context", keywords: ["text", "template"] },
  { id: "date", title: "Current Date", template: "{date}", icon: "calendar-16", section: "Date & Time", keywords: ["today"] },
  { id: "time", title: "Current Time", template: "{time}", icon: "clock-16", section: "Date & Time", keywords: ["now"] },
  { id: "datetime", title: "Date and Time", template: "{datetime}", icon: "calendar-16", section: "Date & Time", keywords: ["now", "today"] },
  { id: "day", title: "Day of the Week", template: "{day}", icon: "calendar-16", section: "Date & Time", keywords: ["weekday"] },
];

/** The placeholder text as it appears in a prompt (caret marker removed). */
export const placeholderText = (option: PlaceholderOption) => option.template.replace("|", "");

/** Short form for menus: `{argument}`, `{browser-tab.url}`. */
export const placeholderKey = (option: PlaceholderOption) => `{${option.id}}`;

export interface TextEdit {
  text: string;
  caret: number;
}

/**
 * Insert a placeholder at [start, end): replaces the selection, or the `{`
 * the user typed to open the menu. The caret lands at the template's `|`
 * (inside `name=""`) or right after the placeholder.
 */
export function insertPlaceholder(text: string, start: number, end: number, option: PlaceholderOption): TextEdit {
  const marker = option.template.indexOf("|");
  const inserted = placeholderText(option);
  return { text: text.slice(0, start) + inserted + text.slice(end), caret: start + (marker >= 0 ? marker : inserted.length) };
}

/**
 * When an edit typed a single `{`, return its index so the placeholder menu
 * can open and later replace it; otherwise null.
 */
export function typedPlaceholderTrigger(previous: string, next: string, caret: number): number | null {
  if (next.length !== previous.length + 1 || caret < 1 || next[caret - 1] !== "{") return null;
  return next.slice(0, caret - 1) + next.slice(caret) === previous ? caret - 1 : null;
}

const RECOGNIZED = new Set(["selection", "clipboard", "argument", "browser-tab", "date", "datetime", "time", "day", "focused-app", "snippet"]);
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  selection: [],
  clipboard: ["offset"],
  argument: ["name", "default", "options"],
  "browser-tab": ["format", "selector"],
  snippet: ["name"],
  "focused-app": [],
  date: ["format", "locale", "offset"],
  time: ["format", "locale", "offset"],
  datetime: ["format", "locale", "offset"],
  day: ["format", "locale", "offset"],
};
const BROWSER_FIELDS = new Set(["browser-tab", "browser-tab.title", "browser-tab.url", "browser-tab.content", "browser-tab.all"]);
const MODIFIERS = new Set(["raw", "uppercase", "lowercase", "trim", "percent-encode", "json-stringify"]);
const PLACEHOLDER = /\{([a-z][\w.-]*)((?:\s+|\|)(?:[^{}"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*)?\}/g;
const ATTRIBUTE = /([\w-]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

export interface ParsedPlaceholder {
  raw: string;
  key: string;
  index: number;
  attrs: Record<string, string>;
  modifiers: string[];
  /** Why the backend would reject it, if it would. */
  problem?: string;
}

/** Split the text after the key into the attribute part and `|` modifiers, ignoring `|` inside quotes. */
function splitModifiers(tail: string): string[] {
  const segments = [""];
  let quote: string | undefined;
  let escaped = false;
  for (const char of tail) {
    if (char === "|" && !quote) segments.push("");
    else segments[segments.length - 1] += char;
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === quote) quote = undefined;
    else if (!quote && (char === '"' || char === "'")) quote = char;
  }
  return segments;
}

function parseOne(match: RegExpMatchArray): ParsedPlaceholder {
  const key = match[1];
  const root = key.split(".")[0];
  const [attrText = "", ...modifierParts] = splitModifiers(match[2] ?? "");
  const result: ParsedPlaceholder = { raw: match[0], key, index: match.index ?? 0, attrs: {}, modifiers: modifierParts.map((m) => m.trim()) };
  const fail = (problem: string) => ({ ...result, problem });
  for (const attr of attrText.trim().matchAll(ATTRIBUTE)) {
    if (result.attrs[attr[1]] !== undefined) return fail(`${match[0]} sets "${attr[1]}" twice`);
    result.attrs[attr[1]] = attr[2].slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }
  if (attrText.trim().replace(ATTRIBUTE, "").trim()) return fail(`Check the attributes of ${match[0]}`);
  const unsupported = Object.keys(result.attrs).find((a) => !ALLOWED_ATTRIBUTES[root].includes(a));
  if (unsupported) return fail(`{${root}} doesn't support "${unsupported}"`);
  if (root === "browser-tab") {
    if (!BROWSER_FIELDS.has(key)) return fail(`Use {browser-tab}, {browser-tab.title}, {browser-tab.url} or {browser-tab.content}`);
    if (result.attrs.format && !["text", "markdown", "html"].includes(result.attrs.format)) return fail(`Browser tab format must be text, markdown or html`);
    if (result.attrs.selector && result.attrs.format === "markdown") return fail(`A browser tab selector can't be combined with the markdown format`);
  }
  const modifier = result.modifiers.find((m) => !MODIFIERS.has(m));
  if (modifier !== undefined) return fail(`Unknown modifier "${modifier}" in ${match[0]}`);
  if (root === "argument" && result.attrs.name !== undefined && !result.attrs.name.trim()) return fail("Give every argument a name");
  if (root === "snippet" && !result.attrs.name?.trim()) return fail("Add the name of the snippet to insert");
  return result;
}

/** Recognized placeholders in a prompt, in order (unknown `{…}` text stays literal, as in the backend). */
export function parsePlaceholders(prompt: string): ParsedPlaceholder[] {
  return [...prompt.matchAll(PLACEHOLDER)].filter((m) => RECOGNIZED.has(m[1].split(".")[0])).map(parseOne);
}

export type PromptSegment = { kind: "text"; text: string } | { kind: "placeholder"; text: string; key: string; invalid: boolean };

/** Prompt split into literal text and placeholders, for highlighting. */
export function tokenizePrompt(prompt: string): PromptSegment[] {
  const segments: PromptSegment[] = [];
  let cursor = 0;
  for (const placeholder of parsePlaceholders(prompt)) {
    if (placeholder.index > cursor) segments.push({ kind: "text", text: prompt.slice(cursor, placeholder.index) });
    segments.push({ kind: "placeholder", text: placeholder.raw, key: placeholder.key, invalid: Boolean(placeholder.problem) });
    cursor = placeholder.index + placeholder.raw.length;
  }
  if (cursor < prompt.length) segments.push({ kind: "text", text: prompt.slice(cursor) });
  return segments;
}

export const MAX_ARGUMENTS = 3;

/**
 * Arguments the command asks for, keyed by name: unnamed ones are numbered,
 * a name used twice is asked once, `options` makes a dropdown and `default`
 * makes it optional.
 */
export function promptArguments(prompt: string): CommandArgument[] {
  const args = new Map<string, CommandArgument>();
  for (const p of parsePlaceholders(prompt)) {
    if (p.key !== "argument" || p.problem) continue;
    const name = p.attrs.name || `Argument ${args.size + 1}`;
    if (args.has(name)) continue;
    const options = p.attrs.options?.split(",").map((v) => v.trim()).filter(Boolean);
    args.set(name, {
      name,
      type: options ? "dropdown" : "text",
      placeholder: p.attrs.default ?? name,
      required: p.attrs.default === undefined,
      default: p.attrs.default,
      data: options?.map((value) => ({ title: value, value })),
    });
  }
  return [...args.values()];
}

/** First reason the backend would reject this prompt, worded for the form. */
export function promptProblem(prompt: string): string | undefined {
  if (!prompt.trim()) return "Enter a prompt";
  const placeholders = parsePlaceholders(prompt);
  const invalid = placeholders.find((p) => p.problem);
  if (invalid) return invalid.problem;
  const seen = new Map<string, { default?: string; options?: string }>();
  for (const p of placeholders) {
    if (p.key !== "argument") continue;
    const { name, default: fallback, options } = p.attrs;
    if (options !== undefined && fallback !== undefined && !options.split(",").map((o) => o.trim()).includes(fallback)) return `The default of "${name ?? "argument"}" must be one of its options`;
    if (!name) continue;
    const previous = seen.get(name);
    if (previous && (previous.default !== fallback || previous.options !== options)) return `Argument "${name}" is used with different settings`;
    seen.set(name, { default: fallback, options });
  }
  if (promptArguments(prompt).length > MAX_ARGUMENTS) return `Use at most ${MAX_ARGUMENTS} different arguments`;
  return undefined;
}
