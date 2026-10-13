import {
  defaultSettings,
  isSettingsKey,
  RpcErrorCode,
  type AIChat,
  type BackendEvents,
  type BackendMethod,
  type BackendParams,
  type BackendResult,
  type CommandInfo,
  type LaunchResult,
  type SettingsValues,
} from "@surgecast/protocol";
import type { BackendClient, CallArgs, CallOptions } from "../backend";
import type { Emitter } from "../emitter";
import { cancelledError, RpcError } from "../errors";
import { ALL_COMMANDS } from "./fixtures/commands";
import { CHATS, EXTENSIONS, MESSAGES, PROVIDERS } from "./fixtures/content";
import { createLibraryHandlers, LIBRARY_COMMANDS, libraryView } from "./library";
import { mockCalculate, mockRootSearch } from "./search";
import { hasMockSession, MockSession } from "./sessions";

type Handlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };

function notFound(what: string): never {
  throw new RpcError({ code: RpcErrorCode.NotFound, message: `${what} not found` });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-browser backend with fixtures, used by `vite dev` without a backend, the
 * gallery and screenshots. State lives in memory for the page's lifetime;
 * mutations emit the same events as the real backend.
 */
/** Dev: `?set.general.windowMode=compact` overrides mock settings (values parsed as JSON when possible). */
function settingsFromUrl(search: string): Partial<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of new URLSearchParams(search)) {
    if (!key.startsWith("set.") || !isSettingsKey(key.slice(4))) continue;
    try {
      out[key.slice(4)] = JSON.parse(raw);
    } catch {
      out[key.slice(4)] = raw;
    }
  }
  return out;
}

export function createMockBackend(events: Emitter<BackendEvents>): BackendClient {
  const settings: SettingsValues = { ...defaultSettings(), ...settingsFromUrl(typeof location === "undefined" ? "" : location.search) } as SettingsValues;
  const commands: CommandInfo[] = [...ALL_COMMANDS, ...LIBRARY_COMMANDS].map((c) => ({ ...c }));
  const chats: AIChat[] = CHATS.map((c) => ({ ...c }));
  const sessions = new Map<string, MockSession>();
  const extensionPrefs = new Map<string, Record<string, unknown>>();
  let sessionCounter = 0;

  const commandById = (id: string) => commands.find((c) => c.id === id) ?? notFound(`Command ${id}`);
  const session = (id: string) => sessions.get(id) ?? notFound(`Session ${id}`);
  const changedCommands = (reason: string) => events.emit("commands.changed", { reason });

  const launch = (id: string, args?: Record<string, string>, fallbackText?: string): LaunchResult => {
    const command = commandById(id);
    if (command.kind === "extension") {
      const [extension, name] = id.slice(4).split(".");
      if (command.needsPreferences) return { kind: "view", view: { id: "extension.preferences", title: `${command.extensionTitle ?? extension} Preferences`, props: { extensionName: extension, commandName: name, launchCommandId: id } } };
      if (!hasMockSession(extension, name)) return { kind: "error", message: `${command.title} is not available in the mock backend` };
      const sessionId = `mock-session-${++sessionCounter}`;
      const created = new MockSession(sessionId, extension, name, events, (sid) => sessions.delete(sid));
      created.state.query = args?.query ?? fallbackText ?? "";
      sessions.set(sessionId, created);
      setTimeout(() => created.start(), 0);
      return { kind: "extension", sessionId, mode: "view" };
    }
    if (command.kind === "app") return { kind: "done", closeWindow: true };
    if (command.kind === "quicklink") return { kind: "done", closeWindow: true };
    if (command.kind === "script") return { kind: "view", view: { id: "script-output", title: command.title, props: { title: command.title, output: "up 3 days, 4:12, 2 users, load averages: 1.92 1.88 1.75\n", exitCode: 0 } } };
    switch (id) {
      case "builtin:ai.askAi":
        return { kind: "ai", target: "quick-ai", prompt: fallbackText ?? args?.prompt };
      case "builtin:ai.aiChat":
        return { kind: "ai", target: "chat" };
      case "builtin:surgecast.settings":
        return { kind: "done", closeWindow: true };
      case "builtin:surgecast.confetti":
        return { kind: "done", closeWindow: true, hud: "🎉" };
      case "builtin:web.google":
        return { kind: "done", closeWindow: true };
      case "builtin:notes.createNote":
        return { kind: "done", closeWindow: true };
      default: {
        const view = libraryView(id, fallbackText);
        if (view) return { kind: "view", view: { ...view, title: command.title } };
        if (command.mode === "no-view") return { kind: "done", closeWindow: true, hud: command.title };
        return { kind: "view", view: { id: id.replace(/^builtin:/, ""), title: command.title } };
      }
    }
  };

  const handlers: Handlers = {
    "app.info": () => ({ version: "0.1.0-mock", dataDir: "/tmp/surgecast-mock", nativeAvailable: false, methods: Object.keys(handlers) }),

    "settings.getAll": () => ({ ...settings }),
    "settings.set": ({ key, value }) => {
      (settings as Record<string, unknown>)[key] = value;
      events.emit("settings.changed", { key, value });
    },
    "settings.reset": ({ key }) => {
      const value = (defaultSettings() as Record<string, unknown>)[key];
      (settings as Record<string, unknown>)[key] = value;
      events.emit("settings.changed", { key, value });
    },

    "search.root": ({ query }) => mockRootSearch(query, commands, settings["launcher.fallbackCommands"]),
    "commands.list": ({ includeDisabled }) => commands.filter((c) => includeDisabled || c.enabled),
    "commands.get": ({ id }) => commands.find((c) => c.id === id) ?? null,
    "commands.launch": ({ id, arguments: args, fallbackText }) => launch(id, args, fallbackText),
    "commands.setPrefs": ({ id, prefs }) => {
      const command = commandById(id);
      if ("alias" in prefs) command.alias = prefs.alias || undefined;
      if ("hotkey" in prefs) command.hotkey = prefs.hotkey;
      if ("enabled" in prefs) command.enabled = prefs.enabled ?? true;
      if ("favoriteOrder" in prefs) command.favorite = prefs.favoriteOrder !== undefined;
      changedCommands("prefs");
      return { ...command };
    },
    "commands.resetRanking": () => changedCommands("ranking"),
    "commands.moveFavorite": ({ id, toIndex }) => {
      const favorites = commands.filter((c) => c.favorite);
      const from = favorites.findIndex((c) => c.id === id);
      if (from === -1) notFound(`Favorite ${id}`);
      const [moved] = favorites.splice(from, 1);
      favorites.splice(Math.max(0, Math.min(favorites.length, toIndex)), 0, moved);
      for (const c of favorites) commands.splice(commands.indexOf(c), 1);
      commands.unshift(...favorites);
      changedCommands("favorites");
    },

    "calc.evaluate": ({ expression }) => mockCalculate(expression) ?? null,

    "ai.providers.list": () => PROVIDERS,
    "ai.models.list": () =>
      PROVIDERS.flatMap((p) => p.models.filter((m) => m.enabled).map((m) => ({ ref: `${p.id}/${m.id}`, providerId: p.id, providerName: p.name, modelId: m.id, name: m.name, capabilities: m.capabilities, contextWindow: m.contextWindow }))),
    "ai.chats.list": () => chats,
    "ai.chats.get": ({ id }) => {
      const chat = chats.find((c) => c.id === id);
      return chat ? { chat, messages: MESSAGES.filter((m) => m.chatId === id) } : null;
    },
    "ai.commands.list": () => [],
    "ai.presets.list": () => [],

    "extensions.list": () => EXTENSIONS,
    "extensions.getPreferences": ({ name, command }) => {
      const extension = EXTENSIONS.find((e) => e.name === name) ?? notFound(`Extension ${name}`);
      const defs = command ? [...extension.preferences, ...(extension.commands.find((c) => c.name === command)?.preferences ?? [])] : extension.preferences;
      const stored = extensionPrefs.get(`${name}/${command ?? ""}`) ?? {};
      const values = Object.fromEntries(defs.map((d) => [d.name, stored[d.name] ?? d.default]));
      return { values, missingRequired: defs.filter((d) => d.required && (values[d.name] === undefined || values[d.name] === "")).map((d) => d.name) };
    },
    "extensions.setPreferences": ({ name, command, values }) => {
      extensionPrefs.set(`${name}/${command ?? ""}`, { ...extensionPrefs.get(`${name}/${command ?? ""}`), ...values });
      const id = `ext:${name}.${command ?? ""}`;
      const cmd = commands.find((c) => c.id === id);
      if (cmd) cmd.needsPreferences = false;
    },

    "ext.session.dispatch": ({ sessionId, handlerId, args }) => {
      session(sessionId).dispatch(handlerId, args ?? []);
      return null;
    },
    "ext.session.pop": ({ sessionId }) => ({ closed: session(sessionId).pop() }),
    "ext.session.close": ({ sessionId }) => {
      sessions.get(sessionId)?.close("user");
    },
    "ext.session.state": () => null,
    "ext.alert.respond": () => undefined,
    "ext.toast.action": () => undefined,

    "themes.list": () => [],
    "sync.status": () => ({ phase: "disabled", deviceId: "mock-device", deviceName: "This Mac", pendingChanges: 0, counts: {} }),
    "hud.show": () => undefined,
    ...createLibraryHandlers(events),
  };

  return {
    kind: "mock",
    async call<M extends BackendMethod>(method: M, ...args: CallArgs<M>): Promise<BackendResult<M>> {
      const [params, options = {}] = args as [BackendParams<M>, CallOptions | undefined];
      const handler = handlers[method] as ((p: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>>) | undefined;
      if (!handler) throw new RpcError({ code: RpcErrorCode.MethodNotFound, message: `${method} is not implemented by the mock backend` });
      await delay(method === "search.root" ? 4 : 12);
      if (options.signal?.aborted) throw cancelledError(method);
      const result = await handler(params);
      return structuredClone(result);
    },
    on: (topic, fn) => events.on(topic, fn),
    getState: () => "open",
    onStateChange: () => () => undefined,
    close: () => undefined,
  };
}
