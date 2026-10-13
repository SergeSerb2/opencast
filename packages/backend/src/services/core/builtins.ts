import type {
  CommandArgument,
  CommandInfo,
  LaunchResult,
} from "@opencast/protocol";
import type { AppContext, LaunchRequest } from "../../context";
import {
  WINDOW_COMMANDS,
  WINDOW_COMMANDS_TITLES,
  SYSTEM_ACTIONS,
  SYSTEM_ACTIONS_TITLES,
} from "./native-commands";
import { DEFAULT_SEARCHES } from "./quicklinks";
import { RpcError } from "../../util/errors";
import { BUILTIN_SUGGESTION_PRIORITIES } from "./root-search";

interface Builtin {
  command: CommandInfo;
  launch(
    ctx: AppContext,
    request: LaunchRequest,
  ): Promise<LaunchResult> | LaunchResult;
}
const COLORS: Record<string, [string, string]> = {
  system: ["#3A3F4B", "#22252D"],
  windowManagement: ["#3B82F6", "#1D4ED8"],
  files: ["#3B82F6", "#1D4ED8"],
  calculator: ["#FF9217", "#E66A00"],
  emoji: ["#FFC531", "#E5A000"],
};
const GROUPS: Record<string, [string, string]> = {
  clipboard: ["Clipboard History", "clipboard-16"],
  snippets: ["Snippets", "text-cursor-16"],
  quicklinks: ["Quicklinks", "link-16"],
  notes: ["OpenCast Notes", "document-16"],
  windowManagement: ["Window Management", "window-16"],
  system: ["System Actions", "gear-16"],
  calculator: ["Calculator", "calculator-16"],
  emoji: ["Emoji & Symbols", "face-smile-16"],
  files: ["File Search", "finder-16"],
  ai: ["OpenCast AI", "stars-16"],
  calendar: ["Calendar", "calendar-16"],
  scripts: ["Script Commands", "terminal-16"],
  settings: ["OpenCast Settings", "gear-16"],
  core: ["OpenCast", "bolt-16"],
  applications: ["Applications", "app-window-16"],
  web: ["Web Searches", "globe-16"],
  menus: ["Menu Search", "list-16"],
  translator: ["Translator", "speech-bubble-16"],
};
function info(
  group: string,
  key: string,
  title: string,
  mode: CommandInfo["mode"],
  args?: CommandArgument[],
): CommandInfo {
  const [extensionTitle, glyph] = GROUPS[group] ?? GROUPS.core;
  const subtitle =
    group === "clipboard" || group === "emoji" || extensionTitle === title
      ? "OpenCast"
      : group === "menus"
        ? "Navigation"
        : group === "core" && key === "manageExtensions"
          ? "Developer"
          : extensionTitle;
  return {
    id: `builtin:${group}.${key}`,
    kind: "builtin",
    title,
    subtitle,
    extensionTitle,
    extensionId: group,
    typeLabel: "Command",
    mode,
    icon: {
      tile: { glyph, background: COLORS[group] ?? ["#FF6363", "#E5484D"] },
    },
    enabled: true,
    suggestionPriority:
      BUILTIN_SUGGESTION_PRIORITIES[`builtin:${group}.${key}`],
    keywords: [group, extensionTitle, key.replace(/([A-Z])/g, " $1")],
    arguments: args,
  };
}
export function builtinCatalog(): Builtin[] {
  const result: Builtin[] = [];
  const add = (
    group: string,
    key: string,
    title: string,
    launch: Builtin["launch"],
    mode: CommandInfo["mode"] = "no-view",
    args?: CommandArgument[],
  ) => result.push({ command: info(group, key, title, mode, args), launch });
  const view = (
    group: string,
    key: string,
    title: string,
    id: string,
    props?: Record<string, unknown>,
  ) =>
    add(
      group,
      key,
      title,
      (_ctx, request) => ({
        kind: "view",
        view: {
          id,
          title,
          props: {
            ...props,
            query: request.fallbackText,
            arguments: request.arguments,
            ...request.launchContext,
          },
        },
      }),
      "view",
    );
  const invoke = async (ctx: AppContext, method: string, params: unknown) =>
    ctx.rpc.invoke(method, params, {
      connectionId: "builtin",
      signal: new AbortController().signal,
    });
  const done = (hud?: string, closeWindow = true): LaunchResult => ({
    kind: "done",
    hud,
    closeWindow,
  });
  view("applications", "search", "Search Applications", "applications");
  view(
    "clipboard",
    "clipboardHistory",
    "Clipboard History",
    "clipboard-history",
  );
  view(
    "clipboard",
    "pasteSequentially",
    "Paste Sequentially",
    "clipboard-history",
    { sequential: true },
  );
  add(
    "clipboard",
    "clearClipboardHistory",
    "Clear Clipboard History",
    async (ctx) => {
      await invoke(ctx, "clipboard.clear", {});
      return done("Cleared Clipboard History");
    },
  );
  for (const [group, singular] of [
    ["snippets", "Snippet"],
    ["quicklinks", "Quicklink"],
  ]) {
    view(group, `search${singular}s`, `Search ${singular}s`, `${group}.search`);
    view(group, `create${singular}`, `Create ${singular}`, `${group}.create`);
    view(group, `import${singular}s`, `Import ${singular}s`, `${group}.import`);
    view(group, `export${singular}s`, `Export ${singular}s`, `${group}.export`);
  }
  add("notes", "open", "Open OpenCast Notes", async (ctx) => {
    await ctx.native.call("window.show", { kind: "notes" });
    return done();
  });
  add("notes", "create", "Create Note", async (ctx) => {
    const note = (await invoke(ctx, "notes.create", {})) as { id: string };
    await ctx.native.call("window.show", { kind: "notes", route: note.id });
    return done();
  });
  view("notes", "search", "Search Notes", "notes.search");
  add("notes", "toggleFloating", "Toggle Floating Notes", async (ctx) => {
    const visible = await ctx.native.call("window.isVisible", {
      kind: "notes",
    });
    if (!visible) await ctx.native.call("window.show", { kind: "notes" });
    const floating = !(
      ctx.entities.get<{ floating: boolean }>("localState", "notes-floating")
        ?.data.floating ?? false
    );
    await ctx.native.call("window.setFloating", { kind: "notes", floating });
    ctx.entities.put("localState", "notes-floating", { floating });
    return done();
  });
  for (const command of WINDOW_COMMANDS)
    add(
      "windowManagement",
      command,
      WINDOW_COMMANDS_TITLES[command],
      async (ctx) => {
        await ctx.native.call("windows.run", {
          command,
          gap: ctx.settings.get("windowManagement.innerGap"),
          outerGap: ctx.settings.get("windowManagement.outerGap"),
        });
        return done();
      },
    );
  view(
    "windowManagement",
    "createWindowManagementCommand",
    "Create Window Management Command",
    "window-management",
    { action: "create" },
  );
  for (const action of SYSTEM_ACTIONS)
    add(
      "system",
      action,
      SYSTEM_ACTIONS_TITLES[action],
      async (ctx, request) => {
        const value =
          action === "setVolume"
            ? Number(request.arguments?.volume ?? request.fallbackText)
            : undefined;
        if (
          action === "setVolume" &&
          (!Number.isFinite(value) || value! < 0 || value! > 100)
        )
          throw RpcError.invalidParams("Volume must be between 0 and 100");
        await ctx.native.call("system.run", { action, value });
        return done(
          action === "toggleHiddenFiles" ? "Toggled Hidden Files" : undefined,
        );
      },
      "no-view",
      action === "setVolume"
        ? [
            {
              name: "volume",
              type: "text",
              placeholder: "Volume (0-100)",
              required: true,
            },
          ]
        : undefined,
    );
  for (const volume of [0, 25, 50, 75, 100])
    add(
      "system",
      `setVolume${volume}`,
      `Set Volume to ${volume}%`,
      async (ctx) => {
        await ctx.native.call("system.run", {
          action: "setVolume",
          value: volume,
        });
        return done(`Volume ${volume}%`);
      },
    );
  view("calculator", "history", "Calculator History", "calculator-history");
  view("emoji", "searchEmoji", "Search Emoji & Symbols", "emoji");
  view("files", "searchFiles", "Search Files", "file-search");
  view("menus", "searchMenuItems", "Search Menu Items", "menu-items");
  view("calendar", "mySchedule", "My Schedule", "calendar");
  view("scripts", "searchScriptCommands", "Search Script Commands", "scripts");
  view(
    "scripts",
    "createScriptCommand",
    "Create Script Command",
    "scripts.create",
  );
  add(
    "scripts",
    "reloadScriptCommands",
    "Reload Script Commands",
    async (ctx) => {
      await invoke(ctx, "scripts.reload", {});
      return done("Reloaded Script Commands");
    },
  );
  view("core", "openSearchStore", "Store", "store");
  view("core", "manageExtensions", "Manage Extensions", "extensions");
  add("core", "openSettings", "Settings", async (ctx) => {
    await ctx.native.call("window.show", { kind: "settings" });
    return done();
  });
  for (const page of [
    "general",
    "launcher",
    "shortcuts",
    "keyboard",
    "cloudSync",
    "advanced",
    "about",
    "ai",
    "clipboard",
  ]) {
    const pageTitle =
      page === "ai"
        ? "AI"
        : page === "clipboard"
          ? "Clipboard History"
          : page.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
    const title = `${pageTitle} Settings`;
    add(
      "settings",
      `open${page[0].toUpperCase()}${page.slice(1)}Settings`,
      title,
      async (ctx) => {
        await ctx.native.call("window.show", {
          kind: "settings",
          route: page === "cloudSync" ? "cloud-sync" : page,
        });
        return done();
      },
    );
  }
  view("core", "showThemeStudio", "Show Theme Studio", "theme-studio");
  view("core", "switchTheme", "Switch Theme", "theme-studio", {
    action: "switch",
  });
  add("core", "confetti", "Confetti", async (ctx) => {
    await ctx.native.call("confetti.show", undefined);
    return done();
  });
  add("core", "openManual", "Search OpenCast Docs", async (ctx) => {
    await ctx.native.call("open.url", {
      url:
        (process.env.OPENCAST_DOCS_URL ?? process.env.SURGECAST_DOCS_URL) ??
        "https://github.com/SergeSerb2/opencast/tree/main/docs",
    });
    return done();
  });
  add("core", "quitApp", "Quit OpenCast", async (ctx) => {
    await ctx.native.call("app.quit", undefined);
    return done();
  });
  add("core", "copyOpenCastVersion", "Copy OpenCast Version", async (ctx) => {
    await ctx.native.call("clipboard.write", {
      content: { kind: "text", text: ctx.version },
    });
    return done("Copied Version");
  });
  view("core", "checkStorage", "Check Storage", "storage");
  view("core", "importRaycastData", "Import Raycast Data", "data.import", {
    format: "rayconfig",
  });
  view("core", "importData", "Import OpenCast Data", "data.import", {
    format: "opencast",
  });
  view("core", "exportData", "Export Data", "data.export");
  view("system", "killProcess", "Kill Process", "processes");
  view("translator", "translate", "Translate", "translator");
  for (const key of ["quickAi", "askAi"])
    add(
      "ai",
      key,
      key === "quickAi" ? "Quick AI" : "Ask AI",
      (_ctx, request) => ({
        kind: "ai",
        target: "quick-ai",
        prompt: request.fallbackText,
      }),
      "view",
    );
  add("ai", "openAiChat", "AI Chat", async (ctx) => {
    await ctx.native.call("window.show", { kind: "ai-chat" });
    return done();
  });
  add("ai", "searchAiChats", "Search AI Chats", async (ctx, request) => {
    await ctx.native.call("window.show", { kind: "ai-chat", route: "search", payload: { query: request.fallbackText ?? "" } });
    return done();
  }, "view");
  view("ai", "searchAiCommands", "Search AI Commands", "ai.commands");
  view("ai", "createAiCommand", "Create AI Command", "ai.commands", {
    action: "create",
  });
  view("ai", "importAiCommands", "Import AI Commands", "ai.commands", {
    action: "import",
  });
  view("ai", "exportAiCommands", "Export AI Commands", "ai.commands", {
    action: "export",
  });
  view("ai", "managePresets", "Manage Presets", "ai.presets");
  view("ai", "createPreset", "Create Preset", "ai.presets", {
    action: "create",
  });
  for (const [key, title, link] of DEFAULT_SEARCHES)
    add(
      "web",
      key,
      title,
      async (ctx, request) => {
        const query = request.arguments?.query ?? request.fallbackText ?? "";
        await ctx.native.call("open.url", {
          url: link.replace("{query}", encodeURIComponent(query)),
        });
        return done();
      },
      "no-view",
      [
        {
          name: "query",
          type: "text",
          placeholder: "Search Query",
          required: true,
        },
      ],
    );
  for (const builtin of result)
    if (
      [
        "builtin:ai.quickAi",
        "builtin:ai.askAi",
        "builtin:files.searchFiles",
        "builtin:emoji.searchEmoji",
        "builtin:translator.translate",
      ].includes(builtin.command.id) ||
      builtin.command.extensionId === "web"
    )
      builtin.command.acceptsFallbackText = true;
  return result;
}
