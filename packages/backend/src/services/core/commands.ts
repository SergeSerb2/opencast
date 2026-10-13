import type {
  AppInfo,
  CommandInfo,
  CommandPrefs,
  Hotkey,
  LaunchResult,
  FileResult,
  RootSearchItem,
} from "@surgecast/protocol";
import type { AppContext, Service } from "../../context";
import { builtinCatalog } from "./builtins";
import { searchFiles } from "./files";
import { calculator } from "./calculator";
import { rankCommands } from "./ranking";
import { appSuggestionPriority, emptyRootItems } from "./root-search";
import { background, list, observeCollection } from "./shared";
import { RpcError } from "../../util/errors";

interface Visit {
  id: string;
  count: number;
  last_used: number;
}
function decodeArguments(
  value: string | null,
): Record<string, string> | undefined {
  if (!value) return undefined;
  try {
    const args = JSON.parse(value);
    if (
      !args ||
      typeof args !== "object" ||
      Array.isArray(args) ||
      Object.values(args).some((v) => typeof v !== "string")
    )
      throw new Error();
    return args;
  } catch {
    throw RpcError.invalidParams("Could not decode deeplink arguments");
  }
}
const EXTENSION_ALIASES: Record<string, string> = {
  "clipboard-history": "clipboard",
  "emoji-picker": "emoji",
  "file-search": "files",
  "script-commands": "scripts",
  "window-management": "windowManagement",
  "raycast-settings": "settings",
  "raycast-core": "core",
  raycast: "core",
  applications: "applications",
  "open-ai": "ai",
};
const COMMAND_ALIASES: Record<string, string> = {
  "notes.openNotes": "notes.open",
  "notes.createNote": "notes.create",
  "notes.searchNotes": "notes.search",
  "ai.openChat": "ai.openAiChat",
  "emoji.searchEmojiAndSymbols": "emoji.searchEmoji",
  "files.search": "files.searchFiles",
};
export async function openDeeplink(
  ctx: AppContext,
  value: string,
): Promise<LaunchResult | null> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw RpcError.invalidParams("Invalid deeplink URL");
  }
  if (!["surgecast:", "raycast:"].includes(url.protocol))
    throw RpcError.invalidParams("Unsupported deeplink scheme");
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const args = decodeArguments(url.searchParams.get("arguments"));
  if (!url.host) {
    // surgecast:// (and raycast://) with no route just shows the launcher.
    await ctx.native.call("window.show", { kind: "main" });
    return { kind: "done", closeWindow: false };
  }
  if (url.host === "extensions" && parts.length === 2)
    return { kind: "view", view: { id: "store.extension", props: { id: `${parts[0]}/${parts[1]}` } } };
  if (url.host === "extensions" && parts.length === 3) {
    const [owner, extension, command] = parts;
    const group = EXTENSION_ALIASES[extension] ?? extension;
    let id = `ext:${extension}.${command}`;
    const builtin = `builtin:${COMMAND_ALIASES[`${group}.${command}`] ?? `${group}.${command}`}`;
    if (
      ["raycast", "surgecast"].includes(owner) &&
      (await ctx.commands.get(builtin))
    )
      id = builtin;
    const launchContext = url.searchParams.get("launchContext");
    let context: Record<string, unknown> | undefined;
    if (launchContext) {
      try {
        const parsed = JSON.parse(launchContext);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error();
        context = parsed;
      } catch {
        throw RpcError.invalidParams(
          "Could not decode deeplink launch context",
        );
      }
    }
    return ctx.commands.launch(id, {
      source: "deeplink",
      arguments: args,
      fallbackText: url.searchParams.get("fallbackText") ?? undefined,
      launchContext: context,
    });
  }
  if (["ai-commands", "ai-presets"].includes(url.host) && parts.length === 1) {
    const collection = url.host === "ai-commands" ? "aiCommands" : "aiPresets";
    const matches = list<{ id: string; name: string }>(ctx, collection).filter(
      (c) => c.name === parts[0] || c.id === parts[0],
    );
    if (matches.length !== 1)
      throw RpcError.invalidParams(
        "Deeplink name must identify exactly one AI command or preset",
      );
    return ctx.commands.launch(
      `${url.host === "ai-commands" ? "ai-command" : "ai-preset"}:${matches[0].id}`,
      { source: "deeplink", arguments: args },
    );
  }
  if (url.host === "confetti")
    return ctx.commands.launch("builtin:core.confetti", { source: "deeplink" });
  if (["snippets", "quicklinks"].includes(url.host) && parts[0] === "import")
    return {
      kind: "view",
      view: {
        id: `${url.host}.import`,
        props: {
          json: url.searchParams.getAll(
            url.host === "snippets" ? "snippet" : "quicklinks",
          ),
        },
      },
    };
  if (url.host === "script-commands" && parts.length === 1) {
    const commands = (await ctx.commands.all()).filter(
      (c) => c.kind === "script" && c.title === parts[0],
    );
    if (commands.length !== 1)
      throw RpcError.invalidParams(
        "Script deeplink name must identify exactly one command",
      );
    return ctx.commands.launch(commands[0].id, {
      source: "deeplink",
      arguments: args,
    });
  }
  if (["ai-chat", "settings"].includes(url.host)) {
    await ctx.native.call("window.show", {
      kind: url.host === "ai-chat" ? "ai-chat" : "settings",
      route: parts.join("/"),
      payload: Object.fromEntries(url.searchParams),
    });
    return { kind: "done", closeWindow: true };
  }
  return null;
}
export const commandsService: Service = {
  name: "core.commands",
  register(ctx) {
    ctx.db.addMigrations({
      id: "core-command-frecency-001",
      up: "CREATE TABLE command_frecency (id TEXT PRIMARY KEY, count INTEGER NOT NULL, last_used INTEGER NOT NULL)",
    });
    const catalog = builtinCatalog();
    const byId = new Map(catalog.map((b) => [b.command.id, b]));
    ctx.commands.registerProvider({
      id: "builtin",
      list: () => catalog.map((b) => b.command),
      launch: (command, request) => byId.get(command.id)!.launch(ctx, request),
    });
    const rootFiles = new Map<string, FileResult>();
    // Running apps, for the dot under application icons. Cached briefly because
    // root search runs on every keystroke.
    let running = { ids: new Set<string>(), at: 0 };
    const runningAppIds = async () => {
      if (Date.now() - running.at < 2000) return running.ids;
      const apps = await ctx.native.call("apps.running", undefined).catch(() => []);
      const ids = new Set<string>();
      for (const app of apps) {
        if (app.bundleId) ids.add(`app:${app.bundleId}`);
        ids.add(`app:${app.path}`);
      }
      running = { ids, at: Date.now() };
      return ids;
    };
    ctx.onShutdown(ctx.native.on("frontmost.changed", () => (running.at = 0)));
    const markRunning = (items: CommandInfo[], ids: Set<string>): RootSearchItem[] =>
      items.map((c) => (c.kind === "app" && ids.has(c.id) ? { ...c, running: true } : c));
    ctx.commands.registerProvider({
      id: "files",
      list: () =>
        [...rootFiles.values()].map(
          (file) =>
            ({
              id: `file:${file.path}`,
              kind: "file",
              title: file.name,
              subtitle: file.path,
              typeLabel: file.kind ?? "File",
              icon: { fileIcon: file.path },
              mode: "no-view",
              enabled: true,
            }) satisfies CommandInfo,
        ),
      launch: async (command) => {
        await ctx.native.call("open.path", { path: command.id.slice(5) });
        return { kind: "done", closeWindow: true };
      },
    });
    let apps: AppInfo[] | undefined;
    let refreshApps = false;
    ctx.commands.registerProvider({
      id: "apps",
      list: async () => {
        if (!apps) {
          apps = await ctx.native.call("apps.list", { refresh: refreshApps });
          refreshApps = false;
        }
        return [
          ...new Map(
            apps.map((app) => [app.bundleId ?? app.path, app]),
          ).values(),
        ].map(
          (app) =>
            ({
              id: `app:${app.bundleId ?? app.path}`,
              kind: "app",
              title: app.name,
              subtitle: app.path,
              typeLabel: "Application",
              icon: { fileIcon: app.path },
              suggestionPriority: appSuggestionPriority(app.bundleId, app.name),
              keywords: [app.bundleId ?? "", app.path],
              mode: "no-view",
              enabled: true,
            }) satisfies CommandInfo,
        );
      },
      launch: async (command) => {
        const app = apps?.find(
          (a) => `app:${a.bundleId ?? a.path}` === command.id,
        );
        if (!app) throw RpcError.notFound(command.id);
        await ctx.native.call("open.path", { path: app.path });
        return { kind: "done", closeWindow: true };
      },
    });
    ctx.onShutdown(
      ctx.native.on("apps.changed", () => {
        apps = undefined;
        refreshApps = true;
        ctx.commands.invalidate("apps");
      }),
    );
    const originalLaunch = ctx.commands.launch.bind(ctx.commands);
    ctx.commands.launch = async (id, request) => {
      const command = await ctx.commands.get(id);
      if (!command?.enabled)
        throw RpcError.invalidParams(
          `Command is disabled or unavailable: ${id}`,
        );
      for (const arg of command.arguments ?? []) {
        const value =
          request.arguments?.[arg.name] ??
          (request.fallbackText && command.arguments?.[0] === arg
            ? request.fallbackText
            : undefined) ??
          arg.default;
        if (arg.required && !value?.trim())
          throw RpcError.invalidParams(
            `Missing argument: ${arg.placeholder || arg.name}`,
          );
        if (
          arg.type === "dropdown" &&
          value &&
          !arg.data?.some((d) => d.value === value)
        )
          throw RpcError.invalidParams(`Invalid argument: ${arg.name}`);
      }
      const result = await originalLaunch(id, request);
      if (result.kind !== "error")
        ctx.db.run(
          "INSERT INTO command_frecency VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1,last_used=excluded.last_used",
          id,
          Date.now(),
        );
      return result;
    };
    let hotkeys = new Map<string, string>();
    let pending = Promise.resolve();
    let ready = false;
    const syncHotkeys = async () => {
      const desired = new Map<string, Hotkey>();
      desired.set("surgecast.toggle", ctx.settings.get("general.globalHotkey"));
      for (const command of await ctx.commands.all())
        if (command.hotkey) desired.set(command.id, command.hotkey);
      for (const id of hotkeys.keys())
        if (!desired.has(id)) {
          await ctx.native.call("hotkeys.unregister", { id });
          hotkeys.delete(id);
        }
      for (const [id, hotkey] of desired)
        if (hotkeys.get(id) !== JSON.stringify(hotkey)) {
          if (hotkeys.has(id)) {
            await ctx.native.call("hotkeys.unregister", { id });
            hotkeys.delete(id);
          }
          const result = await ctx.native.call("hotkeys.register", {
            id,
            hotkey,
          });
          if (result.ok) hotkeys.set(id, JSON.stringify(hotkey));
          else
            ctx.launcher.toast({
              id: `hotkey:${id}`,
              style: "failure",
              title: "Hotkey Conflict",
              message: result.conflict ?? "Choose another shortcut",
            });
        }
    };
    const scheduleHotkeys = () => {
      if (ready)
        pending = pending
          .then(syncHotkeys)
          .catch(() => ctx.log.warn("Hotkey registration failed"));
    };
    ctx.onReady(async () => {
      ready = true;
      await syncHotkeys();
    });
    observeCollection(ctx, "commandPrefs", scheduleHotkeys);
    ctx.onShutdown(ctx.events.on("commands.changed", scheduleHotkeys));
    ctx.onShutdown(
      ctx.settings.onChange((key) => {
        if (key === "general.globalHotkey") scheduleHotkeys();
      }),
    );
    ctx.onShutdown(async () => {
      ready = false;
      await pending;
      for (const id of hotkeys.keys())
        await ctx.native.call("hotkeys.unregister", { id });
    });
    ctx.onShutdown(
      ctx.native.on("hotkey.pressed", ({ id }) =>
        background(
          ctx,
          (async () => {
            if (id === "surgecast.toggle") {
              await ctx.native.call("window.toggle", { kind: "main" });
              return;
            }
            const command = await ctx.commands.get(id);
            if (!command?.enabled) return;
            if (
              command.mode === "view" ||
              command.arguments?.some((a) => a.required)
            ) {
              await ctx.native.call("window.show", {
                kind: "main",
                route: `command:${id}`,
              });
              return;
            }
            const result = await ctx.commands.launch(id, { source: "hotkey" });
            if (result.kind === "done" && result.hud)
              await ctx.launcher.hud(result.hud);
          })(),
          "Command hotkey",
        ),
      ),
    );
    ctx.onShutdown(
      ctx.native.on("url.opened", ({ url }) =>
        background(
          ctx,
          (async () => {
            const result = await openDeeplink(ctx, url);
            if (
              result?.kind === "view" ||
              result?.kind === "ai" ||
              result?.kind === "extension"
            ) {
              await ctx.native.call("window.show", { kind: "main" });
              ctx.launcher.navigate({ action: "launch", result });
            } else if (result?.kind === "done" && result.hud)
              await ctx.launcher.hud(result.hud);
          })(),
          "Deeplink",
        ),
      ),
    );
    ctx.rpc.handleAll({
      "commands.list": (options) => ctx.commands.all(options),
      "commands.get": async ({ id }) => (await ctx.commands.get(id)) ?? null,
      "commands.launch": ({ source = "root", ...params }) =>
        ctx.commands.launch(params.id, { ...params, source }),
      "commands.setPrefs": async ({ id, prefs, unset }) => {
        if (!(await ctx.commands.get(id))) throw RpcError.notFound(id);
        const value: CommandPrefs = {
          ...(ctx.entities.get<CommandPrefs>("commandPrefs", id)?.data ?? {}),
          ...prefs,
        };
        if (value.alias !== undefined && typeof value.alias !== "string")
          throw RpcError.invalidParams("Alias must be text");
        if (
          value.hotkey &&
          (!Array.isArray(value.hotkey.modifiers) ||
            typeof value.hotkey.key !== "string")
        )
          throw RpcError.invalidParams("Invalid hotkey");
        for (const key of unset ?? []) delete value[key];
        ctx.entities.put("commandPrefs", id, value);
        await pending;
        return (await ctx.commands.get(id))!;
      },
      "commands.resetRanking": ({ id }) => {
        if (id) ctx.db.run("DELETE FROM command_frecency WHERE id=?", id);
        else ctx.db.run("DELETE FROM command_frecency");
      },
      "commands.moveFavorite": async ({ id, toIndex }) => {
        if (
          !(await ctx.commands.get(id)) ||
          !Number.isInteger(toIndex) ||
          toIndex < 0
        )
          throw RpcError.invalidParams("Invalid favorite command or index");
        const favorite = ctx.entities
          .list<CommandPrefs>("commandPrefs")
          .filter((r) => r.data.favoriteOrder !== undefined && r.id !== id)
          .sort((a, b) => a.data.favoriteOrder! - b.data.favoriteOrder!)
          .map((r) => r.id);
        favorite.splice(Math.min(toIndex, favorite.length), 0, id);
        ctx.db.transaction(() =>
          favorite.forEach((key, index) =>
            ctx.entities.put("commandPrefs", key, {
              ...(ctx.entities.get<CommandPrefs>("commandPrefs", key)?.data ??
                {}),
              favoriteOrder: index,
            }),
          ),
        );
      },
      "search.root": async ({ query }, caller) => {
        if (typeof query !== "string" || query.length > 512)
          throw RpcError.invalidParams(
            "Search query must be text with at most 512 characters",
          );
        const files =
          ctx.settings.get("launcher.includeFilesInRootSearch") && query.trim()
            ? await searchFiles(ctx, query, 20, undefined, caller.signal).catch(
                () => [],
              )
            : [];
        if (files.length) {
          for (const file of files) rootFiles.set(file.path, file);
          while (rootFiles.size > 2000)
            rootFiles.delete(rootFiles.keys().next().value!);
          ctx.commands.invalidate("files");
        }

        const all = await ctx.commands.all();
        const commands = [
          ...new Map(
            all.filter((c) => c.kind !== "file").map((c) => [c.id, c]),
          ).values(),
        ];
        const visits = new Map(
          ctx.db
            .all<Visit>("SELECT * FROM command_frecency")
            .map((v) => [v.id, { count: v.count, lastUsed: v.last_used }]),
        );
        const prefs = new Map(
          ctx.entities
            .list<CommandPrefs>("commandPrefs")
            .map((r) => [r.id, r.data]),
        );
        const runningIds = await runningAppIds();
        if (!query.trim()) {
          const favorites = commands
            .filter((c) => c.favorite)
            .sort(
              (a, b) =>
                (prefs.get(a.id)?.favoriteOrder ?? 1e9) -
                (prefs.get(b.id)?.favoriteOrder ?? 1e9),
            );
          const root = emptyRootItems(
            commands,
            visits,
            Date.now(),
            ctx.settings.get("launcher.showRecentlyUsed"),
          );
          return {
            query,
            sections: [
              { id: "favorites", title: "Favorites", items: markRunning(favorites, runningIds) },
              {
                id: "suggestions",
                title: "Suggestions",
                items: markRunning(root.suggestions, runningIds),
              },
              { id: "commands", title: "Commands", items: root.commands },
              {
                id: "applications",
                title: "Applications",
                items: markRunning(root.applications, runningIds),
              },
            ].filter((s) => s.items.length),
            fallbacks: [],
          };
        }
        const ranked = rankCommands(
          query,
          commands,
          visits,
          ctx.settings.get("launcher.rootSearchSensitivity"),
        ).slice(0, 50);
        const displayed = new Set(ranked.map((c) => c.id));
        const fallbacks = [
          ...new Set(ctx.settings.get("launcher.fallbackCommands")),
        ]
          .map((id) =>
            commands.find(
              (c) =>
                c.id === id && c.acceptsFallbackText && !displayed.has(c.id),
            ),
          )
          .filter((c): c is CommandInfo => !!c);
        const calculation = ranked.some(
          (c) =>
            c.title.toLowerCase().startsWith(query.trim().toLowerCase()) ||
            c.alias?.toLowerCase().startsWith(query.trim().toLowerCase()),
        )
          ? null
          : await calculator(ctx).evaluate(query);
        return {
          query,
          calculator: calculation ?? undefined,
          sections: [
            ...(ranked.length
              ? [
                  {
                    id: "results",
                    title: "Results",
                    items: markRunning(ranked, runningIds),
                  },
                ]
              : []),
            ...(files.length
              ? [
                  {
                    id: "files",
                    title: "Files",
                    items: files
                      .map((f) => all.find((c) => c.id === `file:${f.path}`)!)
                      .filter((c) => c?.enabled),
                  },
                ]
              : []),
          ].filter((s) => s.items.length),
          fallbacks,
        };
      },
      "deeplink.open": ({ url }) => openDeeplink(ctx, url),
    });
  },
};
