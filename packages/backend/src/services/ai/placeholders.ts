import { load } from "cheerio";
import type { CommandArgument, Snippet } from "@opencast/protocol";
import type { AppContext } from "../../context";
import { browserTab, readPage } from "./web";
interface Placeholder {
  raw: string;
  key: string;
  attrs: Record<string, string>;
  modifiers: string[];
  index: number;
}
const recognized = new Set([
  "selection",
  "clipboard",
  "argument",
  "browser-tab",
  "date",
  "datetime",
  "time",
  "day",
  "focused-app",
  "snippet",
]);
export function parsePlaceholders(prompt: string): Placeholder[] {
  const out: Placeholder[] = [];
  const argumentsSeen = new Set<string>();
  const regex =
    /\{([a-z][\w.-]*)((?:\s+|\|)(?:[^{}"']|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')*)?\}/g;
  for (const match of prompt.matchAll(regex)) {
    const key = match[1];
    if (!recognized.has(key.split(".")[0])) continue;
    const tail = match[2] ?? "";
    // Split modifiers only outside quotes (argument options may contain '|').
    const segments = [""];
    let quote: string | undefined,
      escaped = false;
    for (const char of tail) {
      if (char === "|" && !quote) segments.push("");
      else segments[segments.length - 1] += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = undefined;
      else if (!quote && (char === '"' || char === "'")) quote = char;
    }
    const attrs: Record<string, string> = {};
    const attrText = segments[0]?.trim() ?? "";
    const attrRegex = /([\w-]+)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;
    for (const a of attrText.matchAll(attrRegex)) {
      if (attrs[a[1]] !== undefined)
        throw new Error(`Duplicate placeholder attribute ${a[1]}`);
      attrs[a[1]] = a[2].slice(1, -1).replace(/\\(["'\\])/g, "$1");
    }
    if (attrText.replace(attrRegex, "").trim())
      throw new Error(`Invalid attributes in ${match[0]}`);
    const root = key.split(".")[0];
    const allowed: Record<string, string[]> = {
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
    if (Object.keys(attrs).some((a) => !allowed[root].includes(a)))
      throw new Error(`Unsupported attribute in ${match[0]}`);
    if (root === "argument") {
      attrs.name ||= `Argument ${argumentsSeen.size + 1}`;
      argumentsSeen.add(attrs.name);
    }
    if (root === "browser-tab") {
      if (
        ![
          "browser-tab",
          "browser-tab.title",
          "browser-tab.url",
          "browser-tab.content",
          "browser-tab.all",
        ].includes(key)
      )
        throw new Error(`Unsupported browser-tab field ${key}`);
      if (attrs.format && !["text", "markdown", "html"].includes(attrs.format))
        throw new Error("Browser format must be markdown, text, or html");
      if (attrs.selector && attrs.format === "markdown")
        throw new Error(
          "Browser selectors cannot be combined with markdown format",
        );
    }
    const modifiers = segments.slice(1).map((s) => s.trim());
    if (
      modifiers.some(
        (m) =>
          ![
            "raw",
            "uppercase",
            "lowercase",
            "trim",
            "percent-encode",
            "json-stringify",
          ].includes(m),
      )
    )
      throw new Error(`Unknown modifier in ${match[0]}`);
    out.push({ raw: match[0], key, attrs, modifiers, index: match.index! });
  }
  return out;
}
export function commandArguments(prompt: string): CommandArgument[] {
  const args = new Map<string, CommandArgument>();
  for (const p of parsePlaceholders(prompt))
    if (p.key === "argument") {
      const name = p.attrs.name || `Argument ${args.size + 1}`;
      if (!args.has(name))
        args.set(name, {
          name,
          type: p.attrs.options ? "dropdown" : "text",
          placeholder: p.attrs.default ?? name,
          required: p.attrs.default === undefined,
          data: p.attrs.options
            ? p.attrs.options
                .split(",")
                .map((v) => ({ title: v.trim(), value: v.trim() }))
            : undefined,
        });
    }
  if (args.size > 3)
    throw new Error("AI commands support at most three distinct arguments");
  return [...args.values()];
}
export async function resolvePlaceholders(
  prompt: string,
  ctx: AppContext,
  input: {
    selection?: string;
    arguments?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<string> {
  const placeholders = parsePlaceholders(prompt);
  commandArguments(prompt);
  const cache = new Map<string, Promise<string>>();
  let tab: Promise<{ title: string; url: string }> | undefined;
  const value = async (p: Placeholder): Promise<string> => {
    if (p.key === "selection")
      return (
        input.selection ??
        (await ctx.native.call("input.selectedText", undefined)) ??
        ""
      );
    if (p.key === "clipboard") {
      const offset = p.attrs.offset ?? "0";
      if (!/^\d+$/.test(offset))
        throw new Error("Clipboard offset must be a nonnegative integer");
      if (Number(offset) === 0) {
        const current = await ctx.native.call("clipboard.read", undefined);
        return (
          current?.text ??
          (current?.primary.kind === "text" ? current.primary.text : "")
        );
      }
      if (!ctx.rpc.has("clipboard.list"))
        throw new Error("Clipboard history is unavailable");
      const result = (await ctx.rpc.invoke(
        "clipboard.list",
        { offset: Number(offset), limit: 1 },
        {
          connectionId: "ai-placeholder",
          signal: input.signal ?? new AbortController().signal,
        },
      )) as { items: { text?: string; ocrText?: string }[] };
      const entry = result.items[0];
      if (!entry)
        throw new Error(`Clipboard history offset ${offset} is unavailable`);
      return entry.text ?? entry.ocrText ?? "";
    }
    if (p.key === "argument") {
      const name = p.attrs.name || "Argument 1",
        supplied = input.arguments?.[name] ?? p.attrs.default;
      if (supplied === undefined)
        throw new Error(`Provide the ${name} argument`);
      const options = p.attrs.options?.split(",").map((s) => s.trim());
      if (options && !options.includes(supplied))
        throw new Error(`${name} must be one of: ${options.join(", ")}`);
      return supplied;
    }
    if (p.key.startsWith("browser-tab")) {
      tab ??= browserTab(input.signal);
      const data = await tab;
      const field = p.key.split(".")[1] ?? "all";
      if (field === "title") return data.title;
      if (field === "url") return data.url;
      if (!["all", "content"].includes(field))
        throw new Error(`Unsupported browser-tab field ${field}`);
      const format = p.attrs.format ?? "text";
      if (!["markdown", "text", "html"].includes(format))
        throw new Error("Browser format must be markdown, text, or html");
      if (p.attrs.selector && format === "markdown")
        throw new Error(
          "Browser selectors cannot be combined with markdown format",
        );
      const page = await readPage(
        data.url,
        p.attrs.selector ? "html" : (format as "text" | "html" | "markdown"),
        input.signal,
      );
      let content = page.content;
      if (p.attrs.selector) {
        const $ = load(page.content);
        const selected = $(p.attrs.selector);
        content =
          format === "html"
            ? selected
                .toArray()
                .map((el) => $.html(el))
                .join("\n")
            : selected.text();
      }
      return field === "content"
        ? content
        : `Title: ${data.title}\nURL: ${data.url}\n\n${content}`;
    }
    if (p.key === "focused-app")
      return (await ctx.native.call("apps.frontmost", undefined))?.name ?? "";
    if (["date", "datetime", "time", "day"].includes(p.key)) {
      const now = new Date();
      if (p.attrs.offset) {
        const offset = /^([+-]?\d+)(s|m|h|d)$/.exec(p.attrs.offset);
        if (!offset)
          throw new Error(
            "Date offset must use seconds, minutes, hours, or days (for example +1d)",
          );
        now.setTime(
          now.getTime() +
            Number(offset[1]) *
              ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[offset[2]] ?? 0),
        );
      }
      if (p.attrs.format) {
        const values: Record<string, string> = {
          yyyy: String(now.getFullYear()),
          MM: String(now.getMonth() + 1).padStart(2, "0"),
          dd: String(now.getDate()).padStart(2, "0"),
          HH: String(now.getHours()).padStart(2, "0"),
          mm: String(now.getMinutes()).padStart(2, "0"),
          ss: String(now.getSeconds()).padStart(2, "0"),
        };
        return p.attrs.format.replace(/yyyy|MM|dd|HH|mm|ss/g, (t) => values[t]);
      }
      return p.key === "date"
        ? now.toLocaleDateString(p.attrs.locale)
        : p.key === "time"
          ? now.toLocaleTimeString(p.attrs.locale)
          : p.key === "day"
            ? now.toLocaleDateString(p.attrs.locale, { weekday: "long" })
            : now.toLocaleString(p.attrs.locale);
    }
    if (p.key === "snippet") {
      if (!p.attrs.name) throw new Error("Snippet placeholder needs a name");
      const snippets = ctx.entities
        .list<Snippet>("snippets")
        .filter((s) => s.data.name === p.attrs.name);
      if (snippets.length !== 1)
        throw new Error(`Snippet ${p.attrs.name} is missing or ambiguous`);
      const text = snippets[0].data.text;
      if (
        parsePlaceholders(text).some((n) =>
          ["snippet", "argument"].includes(n.key),
        ) ||
        /\{ai\b/.test(text)
      )
        throw new Error(
          "Snippet contains nested snippet, argument, or AI placeholders",
        );
      return resolvePlaceholders(text, ctx, input);
    }
    throw new Error(`Unsupported placeholder ${p.key}`);
  };
  let result = "",
    cursor = 0;
  for (const p of placeholders) {
    input.signal?.throwIfAborted();
    const cacheKey = `${p.key}:${JSON.stringify(p.attrs)}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = value(p);
      cache.set(cacheKey, pending);
    }
    let replacement = await pending;
    for (const mod of p.modifiers) {
      if (mod === "uppercase") replacement = replacement.toUpperCase();
      if (mod === "lowercase") replacement = replacement.toLowerCase();
      if (mod === "trim") replacement = replacement.trim();
      if (mod === "percent-encode")
        replacement = encodeURIComponent(replacement);
      if (mod === "json-stringify") replacement = JSON.stringify(replacement);
    }
    result += prompt.slice(cursor, p.index) + replacement;
    cursor = p.index + p.raw.length;
  }
  return result + prompt.slice(cursor);
}
