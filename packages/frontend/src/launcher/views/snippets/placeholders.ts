/**
 * Dynamic placeholder helpers for the snippet and quicklink editors: the `{`
 * insertion catalog, caret-aware insertion, and tokenizing text for highlighting.
 * Placeholder resolution itself happens in the backend.
 */

export interface PlaceholderOption {
  id: string;
  title: string;
  icon: string;
  /** Text inserted for the option; empty for options that open a sub-list. */
  insert: string;
  section: "general" | "date";
  /** Opens the list of snippets to reference. */
  opensSnippets?: boolean;
}

export type PlaceholderContext = "snippet" | "quicklink";

const CALCULATOR: PlaceholderOption = { id: "calculator", title: "Calculator", icon: "calculator-16", insert: '{calculator expression="2+2"}', section: "general" };
const UUID: PlaceholderOption = { id: "uuid", title: "UUID", icon: "fingerprint-16", insert: "{uuid}", section: "general" };
const CLIPBOARD: PlaceholderOption = { id: "clipboard", title: "Clipboard Text", icon: "copy-clipboard-16", insert: "{clipboard}", section: "general" };
const ARGUMENT: PlaceholderOption = { id: "argument", title: "Argument", icon: "text-input-16", insert: '{argument name="Argument"}', section: "general" };
const CURSOR: PlaceholderOption = { id: "cursor", title: "Cursor Position", icon: "text-cursor-16", insert: "{cursor}", section: "general" };
const SNIPPET: PlaceholderOption = { id: "snippet", title: "Snippet", icon: "snippets-16", insert: "", section: "general", opensSnippets: true };
const SELECTION: PlaceholderOption = { id: "selection", title: "Selected Text", icon: "text-selection-16", insert: "{selection}", section: "general" };

const DATE_OPTIONS: PlaceholderOption[] = [
  { id: "date", title: "Date", icon: "calendar-16", insert: "{date}", section: "date" },
  { id: "time", title: "Time", icon: "clock-16", insert: "{time}", section: "date" },
  { id: "datetime", title: "Date & Time", icon: "calendar-16", insert: "{datetime}", section: "date" },
  { id: "day", title: "Weekday", icon: "calendar-16", insert: "{day}", section: "date" },
  { id: "date-format", title: "Custom Format", icon: "calendar-16", insert: '{date format="MMMM d, yyyy"}', section: "date" },
  { id: "date-locale", title: "Custom Locale", icon: "calendar-16", insert: '{date locale="en-US"}', section: "date" },
];

/** Options offered by the `{` menu. Snippets get the cursor and snippet references; quicklinks get the selection. */
export function placeholderOptions(context: PlaceholderContext): PlaceholderOption[] {
  const general = context === "snippet" ? [CALCULATOR, UUID, CLIPBOARD, ARGUMENT, CURSOR, SNIPPET] : [CALCULATOR, UUID, CLIPBOARD, ARGUMENT, SELECTION, SNIPPET];
  return [...general, ...DATE_OPTIONS];
}

/**
 * The `{query` being typed at the caret: the position of the opening brace and
 * the text after it. Null when the caret is not inside an unfinished placeholder
 * (a newline or a closing brace ends it).
 */
export function placeholderQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("{");
  if (start === -1) return null;
  const query = before.slice(start + 1);
  if (/[\n}]/.test(query) || query.length > 40) return null;
  return { start, query };
}

/** Case-insensitive prefix/substring filter on titles and inserted keywords. */
export function filterPlaceholderOptions(options: PlaceholderOption[], query: string): PlaceholderOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((o) => o.title.toLowerCase().includes(q) || o.insert.toLowerCase().includes(q) || o.id.includes(q));
}

/**
 * Replace `text[start, end)` (the typed `{query`) with `insert`. The first quoted
 * value is selected so it can be typed over; otherwise the caret goes after it.
 */
export function insertPlaceholder(text: string, start: number, end: number, insert: string): { text: string; selection: [number, number] } {
  const next = text.slice(0, start) + insert + text.slice(end);
  const quote = /"([^"]*)"/.exec(insert);
  if (quote) {
    const from = start + quote.index + 1;
    return { text: next, selection: [from, from + quote[1].length] };
  }
  const caret = start + insert.length;
  return { text: next, selection: [caret, caret] };
}

/** `{snippet name="…"}` with quotes and backslashes escaped. */
export function snippetReference(name: string): string {
  return `{snippet name="${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"}`;
}

export interface TemplateToken {
  kind: "text" | "placeholder";
  text: string;
  /** Placeholder keyword ("clipboard", "date", …); unknown keywords are still tokens. */
  keyword?: string;
  /** Recognized by the placeholder grammar. */
  known?: boolean;
}

const KNOWN_KEYWORDS = new Set(["clipboard", "date", "time", "datetime", "day", "cursor", "uuid", "argument", "selection", "snippet", "calculator", "query"]);

/** Split text into plain runs and `{…}` placeholders (quotes may contain braces). */
export function tokenizeTemplate(text: string): TemplateToken[] {
  const tokens: TemplateToken[] = [];
  const pattern = /\{(?:[^{}"\n]|"(?:[^"\\\n]|\\.)*")*\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index;
    if (index > last) tokens.push({ kind: "text", text: text.slice(last, index) });
    const keyword = /^\{\s*([a-z][a-z-.]*)/i.exec(match[0])?.[1]?.toLowerCase();
    const base = keyword?.split(/[.:]/)[0];
    tokens.push({ kind: "placeholder", text: match[0], keyword, known: base !== undefined && KNOWN_KEYWORDS.has(base) });
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}

/** Distinct argument names in order (`{argument name="x"}` and legacy `{query}`). */
export function templateArgumentNames(text: string): string[] {
  const names: string[] = [];
  for (const token of tokenizeTemplate(text)) {
    if (token.kind !== "placeholder") continue;
    let name: string | undefined;
    if (token.keyword === "argument") name = /name\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(token.text)?.[1] ?? "argument";
    else if (token.keyword === "query") name = "query";
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Validate shared composition limits while leaving literal, unrecognized braces intact. */
export function validateTemplate(text: string, context: PlaceholderContext): string | undefined {
  const tokens = tokenizeTemplate(text).filter((token) => token.kind === "placeholder");
  const cursors = tokens.filter((token) => token.keyword === "cursor");
  if (cursors.length && context !== "snippet") return "Cursor placeholders are available only in snippets";
  if (cursors.length > 1) return "Use only one cursor placeholder";
  if (cursors.some((token) => !/^\{\s*cursor\s*\}$/i.test(token.text))) return "Cursor placeholders cannot have options or modifiers";
  if (context === "snippet" && tokens.some((token) => token.keyword === "selection")) return "Selected text is available only in quicklinks";
  const named = new Set<string>();
  let unnamed = 0;
  for (const token of tokens) {
    if (token.keyword === "argument") {
      const name = /name\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(token.text)?.[1];
      if (name) named.add(name);
      else unnamed++;
    } else if (context === "quicklink" && (!token.known || token.keyword === "query")) {
      named.add(token.text.slice(1, -1).split(":")[0].trim());
    }
  }
  if (named.size + unnamed > 3) return "Use at most three different arguments";
  return undefined;
}
