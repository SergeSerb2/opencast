import { randomUUID } from "node:crypto";
import { RpcError } from "../../util/errors";

export interface PlaceholderArgument {
  name: string;
  default?: string;
  options?: string[];
}
interface Token {
  start: number;
  end: number;
  raw: string;
  kind: string;
  options: Record<string, string>;
  modifiers: string[];
}
export interface TemplateContext {
  now?: Date;
  arguments?: Record<string, string>;
  query?: string;
  url?: boolean;
  clipboard?: (offset: number) => Promise<string>;
  selection?: () => Promise<string>;
  snippet?: (name: string) => Promise<string>;
  calculator?: (expression: string) => Promise<string>;
}
const KINDS = new Set([
  "clipboard",
  "date",
  "time",
  "datetime",
  "day",
  "cursor",
  "uuid",
  "argument",
  "selection",
  "snippet",
  "calculator",
  "query",
]);
const MODIFIERS = new Set([
  "uppercase",
  "lowercase",
  "trim",
  "percent-encode",
  "json-stringify",
  "raw",
]);
function splitUnquoted(value: string, delimiter: string): string[] {
  const result: string[] = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = "";
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === delimiter) {
      result.push(value.slice(start, i));
      start = i + 1;
    }
  }
  result.push(value.slice(start));
  return result;
}
function unescape(value: string): string {
  return value.replace(/\\([\\"':,{}])/g, "$1");
}
export function parseTemplate(text: string, url = false): Token[] {
  const tokens: Token[] = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{" || text[start - 1] === "\\") continue;
    let quote = "";
    let end = start + 1;
    for (; end < text.length; end++) {
      const ch = text[end];
      if (ch === "\n") break;
      if (ch === "\\") {
        end++;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "}") break;
    }
    if (text[end] !== "}") continue;
    const raw = text.slice(start, end + 1);
    const parts = splitUnquoted(raw.slice(1, -1), "|");
    const head = parts.shift()!.trim();
    const match = /^([\w-]+)([\s\S]*)$/.exec(head);
    if (!match) continue;
    let kind = match[1].toLowerCase();
    let tail = match[2].trim();
    const options: Record<string, string> = {};
    if (!KINDS.has(kind)) {
      if (!url || !/^[\w -]+(?::.*)?$/.test(head)) continue;
      const colon = head.indexOf(":");
      kind = "argument";
      options.name = colon < 0 ? head : head.slice(0, colon);
      if (colon >= 0) options.default = head.slice(colon + 1);
      tail = "";
    }
    if (kind === "query" && tail.startsWith(":")) {
      options.default = tail.slice(1);
      tail = "";
    }
    if (kind === "date" && /^['"]/.test(tail)) {
      const legacy = /^(["'])(.*?)\1\s*(.*)$/.exec(tail);
      if (legacy) {
        options.format = legacy[2];
        if (legacy[3]) options.offset = legacy[3];
        tail = "";
      }
    }
    while (tail) {
      const option =
        /^(\w+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s]+))\s*/.exec(
          tail,
        );
      if (!option) throw RpcError.invalidParams(`Invalid options in ${raw}`);
      options[option[1].toLowerCase()] = option[2] ?? option[3] ?? option[4];
      tail = tail.slice(option[0].length);
    }
    const allowed: Record<string, string[]> = {
      clipboard: ["offset"],
      date: ["format", "offset", "locale"],
      time: ["format", "offset", "locale"],
      datetime: ["format", "offset", "locale"],
      day: ["offset", "locale"],
      argument: ["name", "default", "options"],
      snippet: ["name"],
      calculator: ["expression"],
      query: ["default"],
    };
    for (const key of Object.keys(options))
      if (!(allowed[kind] ?? []).includes(key))
        throw RpcError.invalidParams(`Unknown ${kind} option: ${key}`);
    const modifiers = parts.map((s) => s.trim().toLowerCase());
    if (modifiers.some((m) => !MODIFIERS.has(m)))
      throw RpcError.invalidParams(`Unknown modifier in ${raw}`);
    if (
      kind === "cursor" &&
      (url || modifiers.length || Object.keys(options).length)
    )
      throw RpcError.invalidParams(
        "Cursor is only valid without options in snippets",
      );
    if (kind === "cursor" && tokens.some((t) => t.kind === "cursor"))
      throw RpcError.invalidParams("Only one cursor is allowed");
    if (options.format && options.locale)
      throw RpcError.invalidParams("Date format and locale cannot be combined");
    if (
      (kind === "snippet" && !options.name) ||
      (kind === "calculator" && !options.expression)
    )
      throw RpcError.invalidParams(
        `${kind} requires ${kind === "snippet" ? "name" : "expression"}`,
      );
    tokens.push({ start, end: end + 1, raw, kind, options, modifiers });
    start = end;
  }
  return tokens;
}
export function templateArguments(
  text: string,
  url = false,
): PlaceholderArgument[] {
  const result: PlaceholderArgument[] = [];
  for (const token of parseTemplate(text, url)) {
    if (token.kind !== "argument" && token.kind !== "query") continue;
    const name = unescape(
      token.options.name ||
        (token.kind === "query" ? "query" : `argument${result.length + 1}`),
    );
    if (result.some((a) => a.name === name)) continue;
    if (result.length === 3)
      throw RpcError.invalidParams(
        "At most three distinct arguments are supported",
      );
    result.push({
      name,
      default:
        token.options.default === undefined
          ? undefined
          : unescape(token.options.default),
      options:
        token.options.options === undefined
          ? undefined
          : splitUnquoted(token.options.options, ",")
              .map((s) => unescape(s).trim())
              .filter(Boolean),
    });
  }
  return result;
}
export function offsetDate(now: Date, offset = ""): Date {
  const date = new Date(now);
  let rest = offset.trim();
  while (rest) {
    const match = /^([+-]\d+)([mMhHdDyYw])\s*/.exec(rest);
    if (!match) throw RpcError.invalidParams(`Invalid date offset: ${offset}`);
    const n = Number(match[1]);
    switch (match[2]) {
      case "m":
        date.setMinutes(date.getMinutes() + n);
        break;
      case "M":
        date.setMonth(date.getMonth() + n);
        break;
      case "h":
      case "H":
        date.setHours(date.getHours() + n);
        break;
      case "d":
      case "D":
        date.setDate(date.getDate() + n);
        break;
      case "w":
        date.setDate(date.getDate() + n * 7);
        break;
      default:
        date.setFullYear(date.getFullYear() + n);
    }
    rest = rest.slice(match[0].length);
  }
  return date;
}
export function formatDate(date: Date, format: string): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const zone = -date.getTimezoneOffset();
  const z = `${zone < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(zone) / 60))}${pad(Math.abs(zone) % 60)}`;
  const values: Record<string, string> = {
    yyyy: pad(date.getFullYear(), 4),
    yy: pad(date.getFullYear() % 100),
    y: String(date.getFullYear()),
    MMMM: date.toLocaleString("en", { month: "long" }),
    MMM: date.toLocaleString("en", { month: "short" }),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    dd: pad(date.getDate()),
    d: String(date.getDate()),
    EEEE: date.toLocaleString("en", { weekday: "long" }),
    EEE: date.toLocaleString("en", { weekday: "short" }),
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    hh: pad(date.getHours() % 12 || 12),
    h: String(date.getHours() % 12 || 12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
    a: date.getHours() < 12 ? "AM" : "PM",
    xx: z,
    xxx: `${z.slice(0, 3)}:${z.slice(3)}`,
  };
  const normalized = format.replace(/'([^']|'')*'|Y+|Z+/g, (token) =>
    token.startsWith("'")
      ? token
      : token.startsWith("Y")
        ? token.toLowerCase()
        : token.length === 5
          ? "xxx"
          : "xx",
  );
  return normalized.replace(
    /'([^']|'')*'|yyyy|yy|y|MMMM|MMM|MM|M|dd|d|EEEE|EEE|HH|H|hh|h|mm|m|ss|s|SSS|a|xxx|xx/g,
    (token) =>
      token.startsWith("'")
        ? token.slice(1, -1).replace(/''/g, "'")
        : values[token],
  );
}
export async function renderTemplate(
  text: string,
  ctx: TemplateContext = {},
): Promise<{
  text: string;
  cursorOffset?: number;
  arguments: PlaceholderArgument[];
}> {
  const tokens = parseTemplate(text, ctx.url);
  const args = templateArguments(text, ctx.url);
  const memo = new Map<string, Promise<string>>();
  let out = "";
  let position = 0;
  let cursor: number | undefined;
  const seenArguments = new Set<string>();
  const once = (key: string, fn: () => Promise<string>) => {
    if (!memo.has(key)) memo.set(key, fn());
    return memo.get(key)!;
  };
  for (const token of tokens) {
    out += text.slice(position, token.start);
    let value = "";
    const options = Object.fromEntries(
      Object.entries(token.options).map(([k, v]) => [k, unescape(v)]),
    );
    switch (token.kind) {
      case "clipboard": {
        const offset = Number(options.offset ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0)
          throw RpcError.invalidParams(
            "Clipboard offset must be a nonnegative integer",
          );
        value = await once(
          `clipboard:${offset}`,
          () => ctx.clipboard?.(offset) ?? Promise.resolve(""),
        );
        break;
      }
      case "selection":
        value = await once(
          "selection",
          () => ctx.selection?.() ?? Promise.resolve(""),
        );
        break;
      case "uuid":
        value = await once("uuid", async () => randomUUID());
        break;
      case "cursor":
        cursor = out.length;
        break;
      case "argument":
      case "query": {
        const name =
          options.name ||
          (token.kind === "query"
            ? "query"
            : `argument${seenArguments.size + 1}`);
        seenArguments.add(name);
        value =
          ctx.arguments?.[name] ??
          (token.kind === "query" ? ctx.query : undefined) ??
          options.default ??
          "";
        const choices = args.find((a) => a.name === name)?.options;
        if (value && choices?.length && !choices.includes(value))
          throw RpcError.invalidParams(`Invalid value for argument ${name}`);
        break;
      }
      case "snippet":
        value = await once(
          `snippet:${options.name}`,
          () =>
            ctx.snippet?.(options.name) ??
            Promise.reject(RpcError.notFound(`Snippet ${options.name}`)),
        );
        break;
      case "calculator":
        value = await once(
          `calc:${options.expression}`,
          () =>
            ctx.calculator?.(options.expression) ??
            Promise.resolve("Invalid expression"),
        );
        break;
      default: {
        const date = offsetDate(ctx.now ?? new Date(), options.offset);
        try {
          value = options.format
            ? formatDate(date, options.format)
            : token.kind === "day"
              ? date.toLocaleDateString(options.locale, { weekday: "long" })
              : token.kind === "time"
                ? date.toLocaleTimeString(options.locale, {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : token.kind === "datetime"
                  ? date.toLocaleString(options.locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : date.toLocaleDateString(options.locale, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
        } catch {
          throw RpcError.invalidParams("Unsupported date locale or format");
        }
      }
    }
    for (const modifier of token.modifiers) {
      if (modifier === "uppercase") value = value.toUpperCase();
      if (modifier === "lowercase") value = value.toLowerCase();
      if (modifier === "trim") value = value.trim();
      if (modifier === "percent-encode") value = encodeURIComponent(value);
      if (modifier === "json-stringify") value = JSON.stringify(value);
    }
    if (ctx.url && !token.modifiers.includes("raw"))
      value = encodeURIComponent(value);
    out += value;
    position = token.end;
  }
  out += text.slice(position);
  return {
    text: out,
    cursorOffset:
      cursor === undefined ? undefined : Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(out.slice(cursor))).length,
    arguments: args,
  };
}
