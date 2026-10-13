import {
  RpcErrorCode,
  type BackendEvents,
  type BackendMethod,
  type BackendParams,
  type BackendResult,
  type BuiltinView,
  type CalculatorResult,
  type CommandInfo,
  type ClipboardItem,
  type EmojiItem,
  type Note,
  type Quicklink,
  type Snippet,
} from "@surgecast/protocol";
import type { Emitter } from "../emitter";
import { RpcError } from "../errors";
import { QUICKLINKS, tile } from "./fixtures/commands";
import { CLIPBOARD, NOTES, SNIPPETS } from "./fixtures/content";
import { CALC_HISTORY, EMOJI, FILES, FREQUENT_EMOJI, RECENT_FILE_PATHS } from "./fixtures/library";

type Handlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };

function notFound(what: string): never {
  throw new RpcError({ code: RpcErrorCode.NotFound, message: `${what} not found` });
}

function invalid(message: string): never {
  throw new RpcError({ code: RpcErrorCode.InvalidParams, message });
}

const matches = (query: string | undefined, ...fields: (string | undefined)[]) => !query?.trim() || fields.join(" ").toLowerCase().includes(query.trim().toLowerCase());

/** Placeholder `{argument name="x" default="y"}` / legacy `{query}` names, in order of appearance. */
function templateArguments(text: string): { name: string; default?: string; options?: string[] }[] {
  const out: { name: string; default?: string; options?: string[] }[] = [];
  for (const match of text.matchAll(/\{(argument[^}]*|query(?::[^}]*)?)\}/g)) {
    const body = match[1];
    const name = body.startsWith("query") ? "query" : (/name="([^"]*)"/.exec(body)?.[1] ?? "argument");
    if (out.some((a) => a.name === name)) continue;
    const fallback = body.startsWith("query:") ? body.slice(6) : /default="([^"]*)"/.exec(body)?.[1];
    const options = /options="([^"]*)"/.exec(body)?.[1]?.split(",").map((o) => o.trim());
    out.push({ name, default: fallback, options });
  }
  return out;
}

/** Enough of the dynamic placeholder grammar for previews in the browser. */
function renderTemplate(text: string, args: Record<string, string> = {}, encode = false): { text: string; cursorOffset?: number } {
  const now = new Date();
  let cursor: number | undefined;
  const replaced = text.replace(/\{([a-z-]+)([^}]*)\}/gi, (whole, keyword: string, rest: string) => {
    const value = (() => {
      switch (keyword.toLowerCase()) {
        case "clipboard":
          return CLIPBOARD[0]?.text ?? "";
        case "date":
          return /format="yyyy-MM-dd"/.test(rest) ? now.toISOString().slice(0, 10) : now.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        case "time":
          return now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
        case "datetime":
          return now.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        case "day":
          return now.toLocaleDateString(undefined, { weekday: "long" });
        case "uuid":
          return crypto.randomUUID();
        case "selection":
          return "";
        case "cursor":
          return "\u0000";
        case "argument":
        case "query": {
          const name = keyword === "query" ? "query" : (/name="([^"]*)"/.exec(rest)?.[1] ?? "argument");
          return args[name] ?? /default="([^"]*)"/.exec(rest)?.[1] ?? "";
        }
        default:
          return whole;
      }
    })();
    return encode && keyword !== "cursor" ? encodeURIComponent(value) : value;
  });
  const index = replaced.indexOf("\u0000");
  if (index !== -1) cursor = replaced.length - index - 1;
  return { text: replaced.replace("\u0000", ""), cursorOffset: cursor };
}

function parseImport<T>(json: string, key: string): T[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    invalid("Invalid JSON");
  }
  if (Array.isArray(value)) return value as T[];
  const rows = (value as Record<string, unknown> | null)?.[key];
  if (Array.isArray(rows)) return rows as T[];
  return invalid(`Expected an array or { ${key}: [] }`);
}

/** Mock command id → the view id the real backend returns for it. */
const VIEW_ROUTES: Record<string, BuiltinView> = {
  "builtin:clipboard.clipboardHistory": { id: "clipboard-history" },
  "builtin:clipboard.pasteSequentially": { id: "clipboard-history", props: { sequential: true } },
  "builtin:snippets.searchSnippets": { id: "snippets.search" },
  "builtin:snippets.createSnippet": { id: "snippets.create" },
  "builtin:snippets.importSnippets": { id: "snippets.import" },
  "builtin:snippets.exportSnippets": { id: "snippets.export" },
  "builtin:quicklinks.searchQuicklinks": { id: "quicklinks.search" },
  "builtin:quicklinks.createQuicklink": { id: "quicklinks.create" },
  "builtin:quicklinks.importQuicklinks": { id: "quicklinks.import" },
  "builtin:quicklinks.exportQuicklinks": { id: "quicklinks.export" },
  "builtin:emoji.searchEmoji": { id: "emoji" },
  "builtin:files.searchFiles": { id: "file-search" },
  "builtin:notes.searchNotes": { id: "notes.search" },
  "builtin:calculator.calculatorHistory": { id: "calculator-history" },
};

export function libraryView(commandId: string, fallbackText?: string): BuiltinView | undefined {
  const route = VIEW_ROUTES[commandId];
  return route && { ...route, props: { ...route.props, query: fallbackText } };
}

const command = (id: string, title: string, subtitle: string, glyph: string, colors: [string, string]): CommandInfo => ({
  id: `builtin:${id}`,
  kind: "builtin",
  title,
  subtitle,
  extensionTitle: subtitle,
  typeLabel: "Command",
  icon: tile(glyph, colors[0], colors[1]),
  mode: "view",
  enabled: true,
});

/** Commands for library views that the shared fixtures do not list. */
export const LIBRARY_COMMANDS: CommandInfo[] = [
  command("clipboard.pasteSequentially", "Paste Sequentially", "Clipboard History", "clipboard-16", ["#FFA24A", "#F2711C"]),
  command("snippets.importSnippets", "Import Snippets", "Snippets", "download-16", ["#5AB8FF", "#2D7FF0"]),
  command("snippets.exportSnippets", "Export Snippets", "Snippets", "upload-16", ["#5AB8FF", "#2D7FF0"]),
  command("quicklinks.importQuicklinks", "Import Quicklinks", "Quicklinks", "download-16", ["#B58CFF", "#8156F0"]),
  command("quicklinks.exportQuicklinks", "Export Quicklinks", "Quicklinks", "upload-16", ["#B58CFF", "#8156F0"]),
];

const MORE_CLIPBOARD: Omit<ClipboardItem, "createdAt" | "lastCopiedAt">[] = [
  { id: "c7", kind: "text", title: "Remember to rotate the staging API keys before Friday's release.", text: "Remember to rotate the staging API keys before Friday's release.", pinned: false, copyCount: 1, characters: 64, words: 10, contentHash: "h7", sourceApp: { name: "Notes", bundleId: "com.apple.Notes", path: "/System/Applications/Notes.app" } },
  { id: "c8", kind: "text", title: "pnpm --filter @surgecast/frontend build", text: "pnpm --filter @surgecast/frontend build", pinned: false, copyCount: 4, characters: 39, words: 4, contentHash: "h8", sourceApp: { name: "Terminal", bundleId: "com.apple.Terminal", path: "/System/Applications/Utilities/Terminal.app" } },
];

/**
 * Mock handlers for the content views: clipboard history, snippets, quicklinks,
 * notes, emoji, file search and calculator history. State lives for the page's lifetime.
 */
export function createLibraryHandlers(events: Emitter<BackendEvents>): Handlers {
  const now = Date.now();
  const clipboard: ClipboardItem[] = [
    ...CLIPBOARD.slice(0, 1).map((c) => ({ ...c })),
    ...MORE_CLIPBOARD.map((c, i) => ({ ...c, createdAt: now - (8 + i * 3) * 60_000, lastCopiedAt: now - (8 + i * 3) * 60_000 })),
    ...CLIPBOARD.slice(1).map((c) => ({ ...c })),
  ];
  const snippets: Snippet[] = SNIPPETS.map((s) => ({ ...s }));
  const quicklinks: Quicklink[] = QUICKLINKS.map((q) => ({ ...q }));
  const notes: Note[] = NOTES.map((n) => ({ ...n }));
  const history = CALC_HISTORY.map((h) => ({ ...h }));
  const emojiUse = new Map<string, number>(FREQUENT_EMOJI.map((e, i) => [e, FREQUENT_EMOJI.length - i]));
  let counter = 0;
  const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;
  const changed = (collection: string, ids: string[]) => events.emit("entities.changed", { collection, ids, source: "local" });

  const clipboardItem = (itemId: string) => clipboard.find((c) => c.id === itemId) ?? notFound(`Clipboard item ${itemId}`);
  const removeClipboard = (ids: string[]) => {
    for (const itemId of ids) {
      const index = clipboard.findIndex((c) => c.id === itemId);
      if (index !== -1) clipboard.splice(index, 1);
    }
    if (ids.length) events.emit("clipboard.itemsChanged", { ids, deleted: true });
  };

  const snippet = (snippetId: string) => snippets.find((s) => s.id === snippetId) ?? notFound(`Snippet ${snippetId}`);
  const validateSnippet = (value: Pick<Snippet, "name" | "text" | "keyword">, selfId?: string) => {
    if (!value.name?.trim()) invalid("Snippet name must be nonempty text");
    if (value.keyword !== undefined && /\s/.test(value.keyword)) invalid("Snippet keywords cannot contain whitespace");
    if (value.keyword && snippets.some((s) => s.id !== selfId && s.keyword === value.keyword)) invalid(`Keyword "${value.keyword}" is already used`);
  };
  const quicklink = (linkId: string) => quicklinks.find((q) => q.id === linkId) ?? notFound(`Quicklink ${linkId}`);
  const note = (noteId: string) => notes.find((n) => n.id === noteId) ?? notFound(`Note ${noteId}`);
  const noteTitle = (content: string) => content.split("\n")[0].replace(/^\s*#{1,6}\s+/, "").trim().slice(0, 250) || "Untitled Note";

  return {
    "clipboard.list": ({ query, kind, limit = 50, offset = 0 }) => {
      const items = clipboard
        .filter((c) => (!kind || kind === "all" || c.kind === kind) && matches(query, c.title, c.text, c.ocrText, ...(c.filePaths ?? [])))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastCopiedAt - a.lastCopiedAt);
      return { items: items.slice(offset, offset + limit), total: items.length };
    },
    "clipboard.get": ({ id: itemId }) => clipboard.find((c) => c.id === itemId) ?? null,
    "clipboard.paste": ({ id: itemId }) => {
      const item = clipboardItem(itemId);
      item.lastCopiedAt = Date.now();
      item.copyCount += 1;
      events.emit("clipboard.changed", { item });
    },
    "clipboard.copy": ({ id: itemId }) => {
      const item = clipboardItem(itemId);
      item.lastCopiedAt = Date.now();
      item.copyCount += 1;
      events.emit("clipboard.changed", { item });
    },
    "clipboard.pin": ({ id: itemId, pinned }) => {
      const item = clipboardItem(itemId);
      item.pinned = pinned;
      events.emit("clipboard.changed", { item });
    },
    "clipboard.delete": ({ id: itemId }) => {
      clipboardItem(itemId);
      removeClipboard([itemId]);
    },
    "clipboard.clear": ({ includePinned }) => removeClipboard(clipboard.filter((c) => includePinned || !c.pinned).map((c) => c.id)),
    "clipboard.pasteSequentially": ({ ids }) => {
      if (!ids.length) invalid("Select between 1 and 1000 clipboard items");
      ids.forEach(clipboardItem);
    },

    "snippets.list": ({ query }) =>
      snippets.filter((s) => matches(query, s.name, s.keyword, s.text, ...(s.tags ?? []))).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.name.localeCompare(b.name)),
    "snippets.get": ({ id: snippetId }) => snippets.find((s) => s.id === snippetId) ?? null,
    "snippets.create": (params) => {
      validateSnippet(params);
      const created: Snippet = { ...params, id: id("snippet"), createdAt: Date.now(), updatedAt: Date.now() };
      snippets.push(created);
      changed("snippets", [created.id]);
      return created;
    },
    "snippets.update": ({ id: snippetId, patch }) => {
      const current = snippet(snippetId);
      validateSnippet({ ...current, ...patch }, snippetId);
      Object.assign(current, patch, { updatedAt: Date.now() });
      changed("snippets", [snippetId]);
      return { ...current };
    },
    "snippets.delete": ({ id: snippetId }) => {
      const index = snippets.findIndex((s) => s.id === snippetId);
      if (index !== -1) snippets.splice(index, 1);
      changed("snippets", [snippetId]);
    },
    "snippets.render": ({ text, arguments: args }) => ({ ...renderTemplate(text, args), arguments: templateArguments(text) }),
    "snippets.paste": ({ id: snippetId }) => {
      const current = snippet(snippetId);
      Object.assign(current, { copyCount: (current.copyCount ?? 0) + 1, lastUsedAt: Date.now() });
      changed("snippets", [snippetId]);
    },
    "snippets.copy": ({ id: snippetId }) => {
      const current = snippet(snippetId);
      Object.assign(current, { copyCount: (current.copyCount ?? 0) + 1, lastUsedAt: Date.now() });
      changed("snippets", [snippetId]);
    },
    "snippets.import": ({ json }) => {
      let imported = 0;
      let skipped = 0;
      for (const row of parseImport<Record<string, unknown>>(json, "snippets")) {
        const name = typeof row.name === "string" ? row.name : typeof row.title === "string" ? row.title : "";
        const keyword = typeof row.keyword === "string" ? row.keyword : undefined;
        if (!name.trim() || typeof row.text !== "string" || (keyword && snippets.some((s) => s.keyword === keyword))) {
          skipped++;
          continue;
        }
        snippets.push({ id: id("snippet"), name, text: row.text, keyword, tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === "string") : [], createdAt: Date.now(), updatedAt: Date.now() });
        imported++;
      }
      if (imported) changed("snippets", []);
      return { imported, skipped };
    },
    "snippets.export": () => ({ json: JSON.stringify({ schemaVersion: 1, snippets }, null, 2) }),

    "quicklinks.list": ({ query }) => quicklinks.filter((q) => matches(query, q.name, q.link, ...(q.tags ?? []))),
    "quicklinks.create": (params) => {
      if (!params.name?.trim()) invalid("Quicklink name must be nonempty text");
      if (!params.link?.trim()) invalid("Quicklink target must be nonempty text");
      const created: Quicklink = { ...params, id: id("quicklink"), createdAt: Date.now(), updatedAt: Date.now() };
      quicklinks.push(created);
      changed("quicklinks", [created.id]);
      return created;
    },
    "quicklinks.update": ({ id: linkId, patch }) => {
      const current = quicklink(linkId);
      Object.assign(current, patch, { updatedAt: Date.now() });
      changed("quicklinks", [linkId]);
      return { ...current };
    },
    "quicklinks.delete": ({ id: linkId }) => {
      const index = quicklinks.findIndex((q) => q.id === linkId);
      if (index !== -1) quicklinks.splice(index, 1);
      changed("quicklinks", [linkId]);
    },
    "quicklinks.open": ({ id: linkId }) => {
      const current = quicklink(linkId);
      current.openCount = (current.openCount ?? 0) + 1;
      changed("quicklinks", [linkId]);
    },
    "quicklinks.resolve": ({ link, arguments: args, query }) => ({
      url: renderTemplate(link, { ...args, ...(query !== undefined ? { query } : {}) }, !/^(\/|~\/)/.test(link)).text,
      arguments: templateArguments(link),
    }),
    "quicklinks.import": ({ json }) => {
      let imported = 0;
      let skipped = 0;
      for (const row of parseImport<Partial<Quicklink>>(json, "quicklinks")) {
        if (!row.name?.trim() || !row.link?.trim()) {
          skipped++;
          continue;
        }
        quicklinks.push({ id: id("quicklink"), name: row.name, link: row.link, openWith: row.openWith, tags: row.tags ?? [], createdAt: Date.now(), updatedAt: Date.now() });
        imported++;
      }
      if (imported) changed("quicklinks", []);
      return { imported, skipped };
    },
    "quicklinks.export": () => ({ json: JSON.stringify({ schemaVersion: 1, quicklinks }, null, 2) }),

    "notes.list": ({ query }) =>
      notes
        .filter((n) => matches(query, n.content))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt)
        .map((n) => ({ id: n.id, title: n.title, preview: n.content.replace(/\s+/g, " ").slice(0, 200), pinned: n.pinned, characters: [...n.content].length, words: n.content.split(/\s+/).filter(Boolean).length, createdAt: n.createdAt, updatedAt: n.updatedAt, lastOpenedAt: n.lastOpenedAt })),
    "notes.get": ({ id: noteId }) => notes.find((n) => n.id === noteId) ?? null,
    "notes.create": ({ content = "" }) => {
      const created: Note = { id: id("note"), title: noteTitle(content), content, createdAt: Date.now(), updatedAt: Date.now(), lastOpenedAt: Date.now() };
      notes.push(created);
      events.emit("notes.changed", { id: created.id });
      return created;
    },
    "notes.update": ({ id: noteId, content, pinned, caret }) => {
      const current = note(noteId);
      Object.assign(current, { content: content ?? current.content, title: noteTitle(content ?? current.content), pinned: pinned ?? current.pinned, caret: caret ?? current.caret, updatedAt: Date.now() });
      events.emit("notes.changed", { id: noteId });
      return { ...current };
    },
    "notes.delete": ({ id: noteId }) => {
      const index = notes.findIndex((n) => n.id === noteId);
      if (index !== -1) notes.splice(index, 1);
      events.emit("notes.changed", { id: noteId, deleted: true });
    },
    "notes.recent": () => [...notes].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))[0] ?? null,
    "notes.export": ({ id: noteId, format }) => {
      const current = note(noteId);
      const content = format === "text" ? current.content.replace(/^#{1,6}\s+/gm, "").replace(/[*_`]/g, "") : current.content;
      return { content, fileName: `${current.title}.${format === "markdown" ? "md" : "txt"}` };
    },

    "emoji.search": ({ query, category }) => {
      const selected = EMOJI.filter((e) => (!category || e.category.toLowerCase() === category.toLowerCase()) && matches(query, e.name, ...e.keywords));
      const sections: { title: string; items: EmojiItem[] }[] = [];
      const frequent = [...emojiUse.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([emoji]) => selected.find((e) => e.emoji === emoji || e.skins?.includes(emoji)))
        .filter((e): e is EmojiItem => Boolean(e));
      if (frequent.length) sections.push({ title: "Frequently Used", items: frequent });
      if (query?.trim()) {
        if (selected.length) sections.push({ title: "Results", items: selected });
      } else {
        for (const item of selected) {
          const section = sections.find((s) => s.title === item.category) ?? sections[sections.push({ title: item.category, items: [] }) - 1];
          section.items.push(item);
        }
      }
      return { sections };
    },
    "emoji.recordUse": ({ emoji }) => {
      emojiUse.set(emoji, (emojiUse.get(emoji) ?? 0) + 1);
    },

    "files.search": ({ query, limit = 50 }) => (query.trim() ? FILES.filter((f) => f.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, limit) : []),
    "files.recent": ({ limit = 50 }) => RECENT_FILE_PATHS.map((path) => FILES.find((f) => f.path === path)!).slice(0, limit),

    "calc.history": ({ query, limit = 50 }) => history.filter((h) => matches(query, h.input, h.result)).slice(0, limit),
    "calc.saveHistory": ({ result }: { result: CalculatorResult }) => {
      history.unshift({ ...result, id: id("calc"), createdAt: Date.now() });
    },
    "calc.clearHistory": () => {
      history.length = 0;
    },
  };
}
