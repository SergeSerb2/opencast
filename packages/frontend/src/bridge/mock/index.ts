import {
  defaultSettings,
  isSettingsKey,
  RpcErrorCode,
  type AICommand,
  type BackendEvents,
  type BackendMethod,
  type BackendParams,
  type BackendResult,
  type CommandInfo,
  type LaunchResult,
  type Note,
  type NoteSummary,
  type SettingsValues,
} from "@opencast/protocol";
import type { BackendClient, CallArgs, CallOptions } from "../backend";
import type { Emitter } from "../emitter";
import { cancelledError, RpcError } from "../errors";
import { ALL_COMMANDS } from "./fixtures/commands";
import { EXTENSIONS, NOTES, PROVIDERS } from "./fixtures/content";
import { createLibraryHandlers, LIBRARY_COMMANDS, libraryView } from "./library";
import { createAiMockHandlers } from "./ai";
import { mockCalculate, mockRootSearch } from "./search";
import { hasMockSession, MockSession } from "./sessions";
import { createTeamBMock } from "./team-b";
import { isTranslationPrompt } from "./team-b/translator";
import { settingsMockHandlers } from "./settings-handlers";

type Handlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };

/** First line without heading markers, as the backend stores titles. */
function mockNoteTitle(content: string): string {
  return content.split(/\r?\n/)[0].replace(/^\s*#{1,6}\s+/, "").trim().slice(0, 250) || "Untitled Note";
}

function noteSummary(note: Note): NoteSummary {
  const text = note.content.trim();
  return {
    id: note.id,
    title: note.title,
    preview: note.content.replace(/\s+/g, " ").slice(0, 200),
    pinned: note.pinned,
    characters: [...note.content].length,
    words: text ? text.split(/\s+/u).length : 0,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    lastOpenedAt: note.lastOpenedAt,
  };
}

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
  const commands: CommandInfo[] = [];
  const teamB = createTeamBMock({ events, commands });
  // Team B adds AI Commands and Presets to root search from its editable store.
  commands.push(...[...ALL_COMMANDS, ...LIBRARY_COMMANDS, ...teamB.commands].map((c) => ({ ...c })));
  const notes: Note[] = NOTES.map((n) => ({ ...n }));
  const aiCommands = () => teamB.handlers["ai.commands.list"]!({} as never) as AICommand[];
  const ai = createAiMockHandlers(events, settings, aiCommands);
  const aiSettings = settingsMockHandlers({ settings, commands, events });
  let noteCounter = 0;
  const changedNote = (id: string, deleted?: boolean) => {
    events.emit("notes.changed", { id, ...(deleted ? { deleted } : {}) });
    events.emit("entities.changed", { collection: "notes", ids: [id], source: "local" });
  };
  const sessions = new Map<string, MockSession>();
  const extensionPrefs = new Map<string, Record<string, unknown>>();
  let sessionCounter = 0;

  const commandById = (id: string) => commands.find((c) => c.id === id) ?? notFound(`Command ${id}`);
  const session = (id: string) => sessions.get(id) ?? notFound(`Session ${id}`);
  const changedCommands = (reason: string) => events.emit("commands.changed", { reason });

  const launch = (id: string, args?: Record<string, string>, fallbackText?: string): LaunchResult => {
    const command = commandById(id);
    const teamBResult = teamB.launch(command, args, fallbackText);
    if (teamBResult) return teamBResult;
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
    if (command.kind === "ai-command") {
      const aiCommand = aiCommands().find((c) => `ai-command:${c.id}` === command.id) ?? notFound(`AI command ${command.id}`);
      return { kind: "ai", target: aiCommand.output === "window" ? "chat" : "quick-ai", aiCommandId: aiCommand.id };
    }
    if (command.kind === "ai-preset") return { kind: "ai", target: "chat", presetId: command.id.slice("ai-preset:".length) };
    if (command.kind === "app") return { kind: "done", closeWindow: true };
    if (command.kind === "quicklink") return { kind: "done", closeWindow: true };
    if (command.kind === "script") return { kind: "view", view: { id: "script-output", title: command.title, props: { title: command.title, output: "up 3 days, 4:12, 2 users, load averages: 1.92 1.88 1.75\n", exitCode: 0 } } };
    switch (id) {
      case "builtin:ai.askAi":
        return { kind: "ai", target: "quick-ai", prompt: fallbackText ?? args?.prompt };
      case "builtin:ai.aiChat":
        return { kind: "ai", target: "chat" };
      case "builtin:opencast.settings":
        return { kind: "done", closeWindow: true };
      case "builtin:opencast.confetti":
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
    "app.info": () => ({ version: "0.1.0-mock", dataDir: "/tmp/opencast-mock", nativeAvailable: false, methods: Object.keys(handlers) }),

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
    "commands.setPrefs": ({ id, prefs, unset = [] }) => {
      const command = commandById(id);
      if (prefs.alias !== undefined) command.alias = prefs.alias || undefined;
      if (prefs.hotkey !== undefined) command.hotkey = prefs.hotkey;
      if (prefs.enabled !== undefined) command.enabled = prefs.enabled;
      if (prefs.favoriteOrder !== undefined) command.favorite = true;
      if (unset.includes("alias")) command.alias = undefined;
      if (unset.includes("hotkey")) command.hotkey = undefined;
      if (unset.includes("favoriteOrder")) command.favorite = false;
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

    "ai.providers.list": () => PROVIDERS.map((p) => ({ ...p, missingSecretHeaders: [] })),

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
    // Settings-only areas (providers, sync, MCP); the feature mocks below own shared methods.
    ...aiSettings,
    ...createLibraryHandlers(events),
    ...teamB.handlers,
    // AI Chat owns chats, streaming and tools; Team B keeps the AI Commands/Presets store and
    // answers translation prompts.
    ...ai,
    "ai.models.list": aiSettings["ai.models.list"],
    "ai.presets.list": teamB.handlers["ai.presets.list"],
    "ai.presets.reset": teamB.handlers["ai.presets.reset"],
    "ai.ask": (params) => (isTranslationPrompt(params) ? teamB.handlers["ai.ask"]! : ai["ai.ask"]!)(params),
    "ai.stop": (params) => {
      void teamB.handlers["ai.stop"]?.(params);
      return ai["ai.stop"]!(params);
    },
    // Notes window behavior (caret, last opened, sync events) overrides the library store.
    "notes.list": ({ query }) => {
      const words = query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
      return notes
        .filter((n) => words.every((w) => n.content.toLowerCase().includes(w)))
        .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt)
        .map(noteSummary);
    },
    "notes.get": ({ id }) => {
      const note = notes.find((n) => n.id === id);
      if (note) note.lastOpenedAt = Date.now();
      return note ?? null;
    },
    "notes.recent": () => [...notes].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt))[0] ?? null,
    "notes.create": ({ content = "" }) => {
      const now = Date.now();
      const note: Note = { id: `n${now}${++noteCounter}`, title: mockNoteTitle(content), content, createdAt: now, updatedAt: now, lastOpenedAt: now };
      notes.unshift(note);
      changedNote(note.id);
      return note;
    },
    "notes.update": ({ id, content, pinned, caret }) => {
      const note = notes.find((n) => n.id === id) ?? notFound(`Note ${id}`);
      if (content !== undefined) Object.assign(note, { content, title: mockNoteTitle(content) });
      if (pinned !== undefined) note.pinned = pinned;
      if (caret !== undefined) note.caret = caret;
      note.updatedAt = Math.max(Date.now(), note.updatedAt + 1);
      changedNote(id);
      return note;
    },
    "notes.delete": ({ id }) => {
      const index = notes.findIndex((n) => n.id === id);
      if (index === -1) notFound(`Note ${id}`);
      notes.splice(index, 1);
      changedNote(id, true);
    },
    "notes.export": ({ id, format }) => {
      const note = notes.find((n) => n.id === id) ?? notFound(`Note ${id}`);
      const content = format === "text" ? note.content.replace(/^#{1,6}\s+/gm, "").replace(/[*_`]/g, "") : note.content;
      return { content, fileName: `${note.title.replace(/[/\\:]/g, "-")}.${format === "markdown" ? "md" : "txt"}` };
    },
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
