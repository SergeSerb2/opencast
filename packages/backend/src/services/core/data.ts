import {
  readFile,
  writeFile,
  rename,
  unlink,
  stat,
  readdir,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  isSettingsKey,
  SETTINGS,
  type AICommand,
  type AIPreset,
  type Note,
  type Quicklink,
  type Snippet,
  type Theme,
} from "@opencast/protocol";
import type { AppContext, Service } from "../../context";
import { decodeConfig, encodeConfig } from "./config-format";
import { nonempty } from "./shared";
import { noteTitle } from "./notes";
import { validateTheme } from "./themes";
import { templateArguments } from "./placeholders";
import { ScheduledBackup } from "./backup";
import { RpcError } from "../../util/errors";
import { currentSettingKey } from "../../util/legacy-branding";

type ObjectValue = Record<string, unknown>;
const COLLECTIONS = new Set([
  "snippets",
  "quicklinks",
  "notes",
  "aiCommands",
  "aiPresets",
  "aiChats",
  "aiMessages",
  "aiProviders",
  "themes",
  "windowLayouts",
  "commandPrefs",
  "settings",
]);
function obj(value: unknown): ObjectValue {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw RpcError.invalidParams("Expected a record");
  return value as ObjectValue;
}
function rows(value: unknown, key: string): ObjectValue[] {
  if (value === undefined) return [];
  if (Array.isArray(value)) return value.map(obj);
  const category = obj(value);
  const child = category[key] ?? category.data ?? category.items;
  if (Array.isArray(child)) return child.map(obj);
  return [];
}
function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
function timestamp(value: unknown): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : NaN;
  return Number.isFinite(n) ? n : Date.now();
}
function base(value: ObjectValue) {
  return {
    id: String(value.id ?? value.uuid ?? value.commandId ?? randomUUID()),
    createdAt: timestamp(value.createdAt),
    updatedAt: timestamp(value.updatedAt ?? value.modifiedAt),
  };
}
function tags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((s): s is string => typeof s === "string")
    : [];
}
export function proseMirrorMarkdown(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as {
    type?: string;
    text?: string;
    attrs?: ObjectValue;
    content?: unknown[];
    marks?: { type: string; attrs?: ObjectValue }[];
  };
  const content = (node.content ?? []).map(proseMirrorMarkdown).join("");
  switch (node.type) {
    case "text": {
      let result = node.text ?? "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") result = `**${result}**`;
        if (mark.type === "italic") result = `*${result}*`;
        if (mark.type === "code") result = `\`${result}\``;
        if (mark.type === "link")
          result = `[${result}](${text(mark.attrs?.href)})`;
      }
      return result;
    }
    case "paragraph":
      return `${content}\n\n`;
    case "heading":
      return `${"#".repeat(Math.max(1, Math.min(6, Number(node.attrs?.level) || 1)))} ${content}\n\n`;
    case "hardBreak":
      return "\n";
    case "codeBlock":
      return `\`\`\`\n${content}\n\`\`\`\n\n`;
    case "listItem":
      return `- ${content.trim()}\n`;
    case "blockquote":
      return (
        content
          .trim()
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n\n"
      );
    default:
      return content;
  }
}
export function mapSnippet(row: ObjectValue): Snippet {
  const name = nonempty(row.name ?? row.title, "Snippet name");
  const body =
    typeof row.text === "string"
      ? row.text
      : proseMirrorMarkdown(row.rawContent).trimEnd();
  templateArguments(body);
  return {
    ...base(row),
    name,
    text: body,
    icon: text(row.icon) || undefined,
    keyword: text(row.keyword ?? row.alias) || undefined,
    pinned: !!row.pinned,
    tags: tags(row.tags),
    copyCount: Number(row.copyCount) || 0,
  };
}
export function mapQuicklink(row: ObjectValue): Quicklink {
  const link = nonempty(row.link ?? row.url, "Quicklink target");
  templateArguments(link, true);
  return {
    ...base(row),
    name: nonempty(row.name ?? row.title, "Quicklink name"),
    link,
    openWith: text(row.openWith ?? row.applicationID) || undefined,
    tags: tags(row.tags),
    pinned: !!row.pinned,
    openCount: Number(row.openCount) || 0,
  };
}
export function mapNote(row: ObjectValue): Note {
  let raw = row.rawContent ?? row.document;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = undefined;
    }
  }
  const content = text(
    row.content,
    text(row.text, proseMirrorMarkdown(raw).trimEnd()),
  );
  return {
    ...base(row),
    content,
    title: noteTitle(content),
    pinned: !!row.pinned,
    caret: Number(row.caret ?? row.caretPosition) || 0,
    lastOpenedAt: timestamp(row.lastOpenedAt ?? row.openedAt ?? row.accessedAt),
  };
}
export function mapAICommand(row: ObjectValue): AICommand {
  const output = text(row.output ?? row.outputMode, "window");
  return {
    ...base(row),
    name: nonempty(row.name ?? row.title, "AI command name"),
    prompt: nonempty(row.prompt ?? row.promptTemplate, "AI prompt"),
    creativity: creativity(row.creativity ?? row.temperature),
    output: ["window", "quick-ai", "paste", "copy", "replace"].includes(output)
      ? (output as AICommand["output"])
      : "window",
    webSearch: !!row.webSearch,
    builtin: false,
  };
}
function creativity(value: unknown): AICommand["creativity"] {
  return ["none", "low", "medium", "high", "maximum"].includes(String(value))
    ? (value as AICommand["creativity"])
    : typeof value === "number"
      ? value === 0
        ? "none"
        : value < 0.4
          ? "low"
          : value < 0.8
            ? "medium"
            : "high"
      : "medium";
}
export function mapAIPreset(row: ObjectValue): AIPreset {
  return {
    ...base(row),
    name: nonempty(row.name ?? row.title, "AI preset name"),
    instructions: text(
      row.instructions ?? row.systemInstructions ?? row.systemPrompt,
    ),
    creativity: creativity(row.creativity ?? row.temperature),
    webSearch: !!row.webSearch,
    tools: tags(row.tools),
    builtin: false,
  };
}
function mapTheme(row: ObjectValue): Theme {
  const colors = (row.colors ?? row) as ObjectValue;
  const theme: Theme = {
    ...base(row),
    name: nonempty(row.name, "Theme name"),
    appearance: row.appearance as Theme["appearance"],
    builtin: false,
    colors: Object.fromEntries(
      [
        "background",
        "backgroundSecondary",
        "text",
        "accent",
        "selection",
        "loader",
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "purple",
        "magenta",
      ].map((key) => {
        const alternate: Record<string, string> = {
          background: "backgroundColor",
          backgroundSecondary: "secondaryBackgroundColor",
          text: "foregroundColor",
        };
        return [
          key,
          text(
            colors[key] ??
              colors[key === "text" ? "foreground" : key] ??
              row[alternate[key] ?? `${key}Color`],
            key === "accent" ? "#4FA3F8" : "",
          ),
        ];
      }),
    ) as Theme["colors"],
  };
  validateTheme(theme);
  return theme;
}
export interface ImportResult {
  category: string;
  imported: number;
  error?: string;
}
export function importRaycastPayload(
  ctx: AppContext,
  payload: ObjectValue,
  categories?: string[],
): ImportResult[] {
  if (categories && !categories.length)
    throw RpcError.invalidParams("Select at least one category");
  const canonical: ObjectValue = { ...payload };
  const classic: Record<string, string> = {
    builtin_package_snippets: "snippets",
    builtin_package_quicklinks: "quicklinks",
    builtin_package_raycastNotes: "notes",
    "builtin_package_open-ai": "ai",
    raycast_themes: "themes",
    builtin_package_raycastPreferences: "settings",
  };
  for (const [old, key] of Object.entries(classic))
    if (canonical[key] === undefined && payload[old] !== undefined)
      canonical[key] = payload[old];
  const results: ImportResult[] = [];
  const importCategory = (
    category: string,
    source: unknown,
    fn: () => number,
  ) => {
    if (source === undefined || (categories && !categories.includes(category)))
      return;
    try {
      results.push({ category, imported: ctx.db.transaction(fn) });
    } catch (error) {
      results.push({
        category,
        imported: 0,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  };
  for (const [category, key, mapper] of [
    ["snippets", "snippets", mapSnippet],
    ["quicklinks", "quicklinks", mapQuicklink],
    ["notes", "notes", mapNote],
    ["themes", "themes", mapTheme],
  ] as const) {
    importCategory(category, canonical[category], () => {
      const mapped = rows(canonical[category], key).map((row) =>
        (mapper as (r: ObjectValue) => Snippet | Quicklink | Note | Theme)(row),
      );
      for (const value of mapped)
        ctx.entities.put(category, value.id, value, {
          createdAt: value.createdAt,
        });
      return mapped.length;
    });
  }
  importCategory("ai", canonical.ai, () => {
    const ai = obj(canonical.ai);
    const commands = rows(ai.commands ?? ai.aiCommands, "commands").map(
      mapAICommand,
    );
    const presets = rows(
      ai.modes ?? ai.presets ?? ai.aiChatPresets,
      "presets",
    ).map(mapAIPreset);
    for (const command of commands)
      ctx.entities.put("aiCommands", command.id, command, {
        createdAt: command.createdAt,
      });
    for (const preset of presets)
      ctx.entities.put("aiPresets", preset.id, preset, {
        createdAt: preset.createdAt,
      });
    ctx.commands.invalidate("ai-commands");
    ctx.commands.invalidate("ai-presets");
    return commands.length + presets.length;
  });
  importCategory("settings", canonical.settings, () => {
    const settings = obj(canonical.settings);
    const general = settings.general ? obj(settings.general) : settings;
    const mapping: Record<string, string> = {
      appearance: "general.appearance",
      themeDarkId: "general.themeDark",
      themeLightId: "general.themeLight",
      windowMode: "general.windowMode",
      uiZoom: "general.uiZoom",
      openAtLogin: "general.openAtLogin",
      showInMenuBar: "general.showInMenuBar",
      rootSearchSensitivity: "launcher.rootSearchSensitivity",
      popToRootTimeout: "launcher.popToRootTimeout",
      faviconProvider: "advanced.faviconProvider",
      navigationBindings: "keyboard.navigationBindings",
      pageNavigationKeys: "keyboard.pageNavigationKeys",
    };
    let count = 0;
    for (const [old, value] of Object.entries(general)) {
      const key = mapping[old] ?? old;
      if (!isSettingsKey(key)) continue;
      if (!validSetting(key, value)) continue;
      ctx.settings.set(key, value as never);
      count++;
    }
    for (const row of rows(settings.themes, "themes")) {
      const theme = mapTheme(row);
      ctx.entities.put("themes", theme.id, theme);
      count++;
    }
    return count;
  });
  return results;
}
function validSetting(key: keyof typeof SETTINGS, value: unknown): boolean {
  if (key === "advanced.backupAutoDelete") return value === "never" || [1, 5, 10].includes(value as number);
  if (key === "ai.chatFolders") return Array.isArray(value) && value.every(folder => {
    if (!folder || typeof folder !== "object") return false;
    const { id, name, createdAt } = folder as { id?: unknown; name?: unknown; createdAt?: unknown };
    return typeof id === "string" && !!id && typeof name === "string" && !!name.trim() && typeof createdAt === "number" && Number.isFinite(createdAt);
  }) && new Set(value.map(folder => folder.id)).size === value.length;
  const defaultValue = SETTINGS[key].default;
  const options: Partial<Record<keyof typeof SETTINGS, string[]>> = {
    "general.appearance": ["system", "light", "dark"],
    "general.windowMode": ["expanded", "compact"],
    "launcher.rootSearchSensitivity": ["low", "medium", "high"],
    "advanced.faviconProvider": ["google", "duckduckgo", "none"],
    "keyboard.navigationBindings": ["macos", "emacs", "vim"],
    "keyboard.pageNavigationKeys": ["square-brackets", "page-keys"],
  };
  if (options[key]) return options[key]!.includes(String(value));
  if (Array.isArray(defaultValue))
    return Array.isArray(value) && value.every((v) => typeof v === "string");
  if (defaultValue === null) return value === null || typeof value === "string";
  if (typeof defaultValue === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (typeof defaultValue === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const hotkey = value as { key?: unknown; modifiers?: unknown };
    return (
      typeof hotkey.key === "string" &&
      Array.isArray(hotkey.modifiers) &&
      hotkey.modifiers.every((m) => ["cmd", "ctrl", "opt", "shift"].includes(m))
    );
  }
  return typeof value === typeof defaultValue;
}
function validateOwnRecord(
  collection: string,
  id: string,
  data: ObjectValue,
): ObjectValue {
  if (collection === "notes") {
    if (typeof data.content !== "string")
      throw RpcError.invalidParams("Note content must be text");
    return { ...data, id, title: noteTitle(data.content) };
  }
  if (collection === "snippets") {
    nonempty(data.name, "Snippet name");
    if (typeof data.text !== "string")
      throw RpcError.invalidParams("Snippet content must be text");
    templateArguments(data.text);
  }
  if (collection === "quicklinks") {
    nonempty(data.name, "Quicklink name");
    templateArguments(nonempty(data.link, "Quicklink target"), true);
  }
  if (collection === "themes") validateTheme(data as unknown as Theme);
  if (collection === "aiProviders") {
    if (["apiKey", "password", "token"].some((key) => key in data))
      throw RpcError.invalidParams(
        "Provider secrets must be configured in Keychain",
      );
    nonempty(data.name, "Provider name");
    nonempty(data.baseUrl, "Provider base URL");
    if (!Array.isArray(data.models))
      throw RpcError.invalidParams("Provider models must be an array");
  }
  if (["aiCommands", "aiPresets", "windowLayouts"].includes(collection))
    nonempty(data.name, "Name");
  if (collection === "aiCommands") nonempty(data.prompt, "AI prompt");
  if (collection === "aiPresets" && typeof data.instructions !== "string")
    throw RpcError.invalidParams("AI preset instructions must be text");
  if (collection === "windowLayouts") {
    const rect = obj(data.rect);
    const { x, y, width, height } = rect as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1 ||
      y + height > 1
    )
      throw RpcError.invalidParams("Layout must fit within the screen");
  }
  return collection === "commandPrefs" || collection === "settings"
    ? data
    : { ...data, id };
}
function importOpenCast(ctx: AppContext, payload: ObjectValue): ImportResult[] {
  if (payload.schemaVersion !== 1)
    throw RpcError.invalidParams("Unsupported OpenCast payload version");
  const collections = obj(payload.collections);
  const results: ImportResult[] = [];
  for (const [collection, values] of Object.entries(collections)) {
    if (!COLLECTIONS.has(collection)) continue;
    try {
      const records = rows(values, collection).map((record) => ({
        id: collection === "settings" ? currentSettingKey(nonempty(record.id, "Entity id")) : nonempty(record.id, "Entity id"),
        data: validateOwnRecord(
          collection,
          nonempty(record.id, "Entity id"),
          obj(record.data),
        ),
        createdAt: timestamp(record.createdAt),
      }));
      ctx.db.transaction(() => {
        for (const record of records) {
          if (collection === "settings") {
            if (isSettingsKey(record.id)) {
              if (!validSetting(record.id, record.data.value))
                throw RpcError.invalidParams(`Invalid setting ${record.id}`);
              ctx.settings.set(record.id, record.data.value as never);
            }
          } else
            ctx.entities.put(collection, record.id, record.data, {
              createdAt: record.createdAt,
            });
        }
      });
      results.push({ category: collection, imported: records.length });
    } catch (error) {
      results.push({
        category: collection,
        imported: 0,
        error: error instanceof Error ? error.message : "Import failed",
      });
    }
  }
  ctx.commands.invalidate();
  return results;
}
async function readConfiguration(path: string): Promise<Buffer> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 64 * 1024 * 1024)
    throw RpcError.invalidParams(
      "Configuration must be a file smaller than 64 MiB",
    );
  return readFile(path);
}
export async function exportData(ctx: AppContext, { path, password, categories }: { path: string; password?: string; categories?: string[] }): Promise<{ path: string }> {
        if (
          categories &&
          (!categories.length || categories.some((c) => !COLLECTIONS.has(c)))
        )
          throw RpcError.invalidParams("Select valid export categories");
        const collections = Object.fromEntries(
          [...(categories ?? COLLECTIONS)].map((collection) => [
            collection,
            collection === "settings"
              ? Object.entries(ctx.settings.getAll()).map(([id, value]) => ({
                  id,
                  data: { value },
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                }))
              : ctx.entities.list(collection).map((r) => ({
                  id: r.id,
                  data: r.data,
                  createdAt: r.createdAt,
                  updatedAt: r.updatedAt,
                })),
          ]),
        );
        const bytes = await encodeConfig(
          { schemaVersion: 1, collections },
          password,
        );
        const part = `${path}.${randomUUID()}.part`;
        try {
          await writeFile(part, bytes, { mode: 0o600, flag: "wx" });
          await rename(part, path);
        } finally {
          await unlink(part).catch(() => {});
        }
        return { path };
}

export const dataService: Service = {
  name: "core.data",
  register(ctx) {
    const backup = new ScheduledBackup(ctx, exportData);
    ctx.onReady(() => backup.tick());
    ctx.onShutdown(() => backup.stop());
    ctx.rpc.handleAll({
      "data.backup.hasPassphrase": () => ctx.secrets.has("data.backup:passphrase"),
      "data.backup.setPassphrase": async ({ passphrase }) => {
        if (passphrase !== null && typeof passphrase !== "string")
          throw RpcError.invalidParams("Invalid backup passphrase");
        if (passphrase) await ctx.secrets.set("data.backup:passphrase", passphrase);
        else await ctx.secrets.delete("data.backup:passphrase");
      },
      "data.importRayconfig": async ({ path, password, categories }) => {
        const decoded = await decodeConfig(
          await readConfiguration(path),
          password,
        );
        if (decoded.family === "opencast")
          throw RpcError.invalidParams(
            "Use data.import for an OpenCast export",
          );
        return {
          results: importRaycastPayload(ctx, decoded.payload, categories),
        };
      },
      "data.import": async ({ path, password }) => {
        const decoded = await decodeConfig(
          await readConfiguration(path),
          password,
          true,
        );
        return { results: importOpenCast(ctx, decoded.payload) };
      },
      "data.storage": async () => {
        const size = async (path: string) =>
          (await stat(path).catch(() => null))?.size ?? 0;
        const databaseBytes = (
          await Promise.all(
            [ctx.db.path, `${ctx.db.path}-wal`, `${ctx.db.path}-shm`].map(
              (file) => size(file),
            ),
          )
        ).reduce((a, b) => a + b, 0);
        const clipboardDir = join(ctx.dataDir, "clipboard");
        const images = await readdir(clipboardDir).catch(() => []);
        const clipboardBytes = (
          await Promise.all(
            images.map((file) => size(join(clipboardDir, file))),
          )
        ).reduce((a, b) => a + b, 0);
        const entities = Object.fromEntries(
          ctx.db
            .all<{
              collection: string;
              n: number;
            }>(
              "SELECT collection,count(*) n FROM entities WHERE deleted=0 GROUP BY collection",
            )
            .map((row) => [row.collection, row.n]),
        );
        return {
          totalBytes: databaseBytes + clipboardBytes,
          databaseBytes,
          clipboardBytes,
          entities,
          clipboardItems: ctx.db.get<{ n: number }>(
            "SELECT count(*) n FROM clipboard_history",
          )!.n,
        };
      },
      "data.export": async ({ path, password, categories }) => {
        return exportData(ctx, { path, password, categories });
      },
    });
  },
};
