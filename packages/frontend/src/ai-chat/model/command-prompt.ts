/**
 * Turning an AI Command's prompt template into a chat message when the command
 * is picked from the composer's `/` menu: the composer text is the command's
 * input (`{selection}` and its `{argument}`s). Context the chat window cannot
 * read (browser tabs, snippets) is reported as unsupported instead of silently
 * dropped.
 */

export interface PromptContext {
  /** Composer text: the command's input. */
  input: string;
  clipboard?: string;
  focusedApp?: string;
  now: Date;
}

export type PromptResult = { ok: true; prompt: string } | { ok: false; unsupported: string[] };

const PLACEHOLDER = /\{([a-z][\w.-]*)((?:\s+|\|)(?:[^{}"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*)?\}/g;
const ATTRIBUTE = /([\w-]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
const KNOWN = new Set(["selection", "clipboard", "argument", "browser-tab", "date", "datetime", "time", "day", "focused-app", "snippet"]);

function attributes(tail: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const head = tail.split("|")[0] ?? "";
  for (const match of head.matchAll(ATTRIBUTE)) attrs[match[1]] = match[2].slice(1, -1).replace(/\\(["'\\])/g, "$1");
  return attrs;
}

function applyModifiers(value: string, tail: string): string {
  const modifiers = tail
    .split("|")
    .slice(1)
    .map((m) => m.trim());
  let out = value;
  for (const modifier of modifiers) {
    if (modifier === "uppercase") out = out.toUpperCase();
    else if (modifier === "lowercase") out = out.toLowerCase();
    else if (modifier === "trim") out = out.trim();
    else if (modifier === "percent-encode") out = encodeURIComponent(out);
    else if (modifier === "json-stringify") out = JSON.stringify(out);
  }
  return out;
}

/** Placeholder roots used by a template (e.g. ["selection", "clipboard"]). */
export function placeholderKinds(template: string): string[] {
  const kinds = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    const root = match[1].split(".")[0];
    if (KNOWN.has(root)) kinds.add(root);
  }
  return [...kinds];
}

/** Resolve a command template against the composer input and local context. */
export function applyCommandPrompt(template: string, context: PromptContext): PromptResult {
  const unsupported = new Set<string>();
  let usedInput = false;
  let firstArgument: string | undefined;
  const prompt = template.replace(PLACEHOLDER, (raw, key: string, tail = "") => {
    const root = key.split(".")[0];
    if (!KNOWN.has(root)) return raw;
    const attrs = attributes(tail);
    let value: string;
    switch (root) {
      case "selection":
        usedInput = true;
        value = context.input;
        break;
      case "argument": {
        const name = attrs.name ?? "";
        firstArgument ??= name;
        if (name === firstArgument) {
          usedInput = true;
          value = context.input || attrs.default || "";
        } else value = attrs.default ?? "";
        break;
      }
      case "clipboard":
        if (context.clipboard === undefined) unsupported.add("clipboard");
        value = context.clipboard ?? "";
        break;
      case "focused-app":
        value = context.focusedApp ?? "";
        break;
      case "date":
        value = context.now.toLocaleDateString(attrs.locale);
        break;
      case "time":
        value = context.now.toLocaleTimeString(attrs.locale, { hour: "2-digit", minute: "2-digit" });
        break;
      case "datetime":
        value = context.now.toLocaleString(attrs.locale);
        break;
      case "day":
        value = context.now.toLocaleDateString(attrs.locale, { weekday: "long" });
        break;
      default:
        unsupported.add(root);
        value = "";
    }
    return applyModifiers(value, tail);
  });
  if (unsupported.size) return { ok: false, unsupported: [...unsupported] };
  // A template without an input placeholder still receives what the user typed.
  const input = context.input.trim();
  return { ok: true, prompt: usedInput || !input ? prompt : `${prompt.trimEnd()}\n\n${input}` };
}
