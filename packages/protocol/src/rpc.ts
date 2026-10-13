/**
 * Backend RPC surface (frontend → backend over WebSocket) and backend push
 * events (backend → frontend, JSON-RPC notification "event" { topic, payload }).
 *
 * Naming: "<area>.<verb>". Params are always an object (or void).
 * Long-running streams (AI) return a streamId immediately and deliver chunks
 * via the "ai.stream" event; cancel with "ai.stop".
 */

import type {
  AIAttachment,
  AIChat,
  AICommand,
  AIMessage,
  AIModelOption,
  AIPreset,
  AIProvider,
  AIStreamEvent,
  AIToolInfo,
  CalculatorResult,
  ClipboardItem,
  ClipboardItemKind,
  CommandId,
  CommandInfo,
  CommandPrefs,
  Creativity,
  EmojiItem,
  ExtensionSessionState,
  FileResult,
  InstalledExtension,
  LaunchResult,
  MCPServer,
  ModelRef,
  Note,
  NoteSummary,
  Quicklink,
  ProcessInfo,
  RootSearchResult,
  ScriptCommand,
  Snippet,
  StoreExtension,
  SyncDevice,
  SyncStatus,
  Theme,
  WindowLayout,
} from "./models";
import type { SettingsKey, SettingsValues } from "./settings";
import type { AlertOptions, ToastState } from "./ui";
import type { CalendarEvent, MenuItemInfo, WindowCommand } from "./native";

type Void = void;

export interface BackendMethods {
  // ---- meta -------------------------------------------------------------------
  "app.info": { params: Void; result: { version: string; dataDir: string; nativeAvailable: boolean; methods: string[] } };

  // ---- settings ----------------------------------------------------------------
  "settings.getAll": { params: Void; result: SettingsValues };
  "settings.set": { params: { key: SettingsKey; value: unknown }; result: Void };
  "settings.reset": { params: { key: SettingsKey }; result: Void };

  // ---- root search & commands --------------------------------------------------
  "search.root": { params: { query: string }; result: RootSearchResult };
  "commands.list": { params: { includeDisabled?: boolean }; result: CommandInfo[] };
  "commands.get": { params: { id: CommandId }; result: CommandInfo | null };
  /**
   * Run a command. `arguments` are inline argument values; `fallbackText` is
   * the root search text when run as a fallback. Records frecency.
   */
  "commands.launch": {
    params: { id: CommandId; arguments?: Record<string, string>; fallbackText?: string; launchContext?: Record<string, unknown>; source?: "root" | "hotkey" | "deeplink" | "fallback" | "alias" };
    result: LaunchResult;
  };
  /** `unset` clears fields (JSON cannot carry `undefined`), e.g. removing an alias or a favorite. */
  "commands.setPrefs": { params: { id: CommandId; prefs: Partial<CommandPrefs>; unset?: (keyof CommandPrefs)[] }; result: CommandInfo };
  "commands.resetRanking": { params: { id?: CommandId }; result: Void };
  "commands.moveFavorite": { params: { id: CommandId; toIndex: number }; result: Void };

  // ---- calculator -----------------------------------------------------------------
  "calc.evaluate": { params: { expression: string }; result: CalculatorResult | null };
  "calc.history": { params: { query?: string; limit?: number }; result: (CalculatorResult & { id: string; createdAt: number })[] };
  "calc.saveHistory": { params: { result: CalculatorResult }; result: Void };
  "calc.clearHistory": { params: Void; result: Void };

  // ---- clipboard history ----------------------------------------------------------
  "clipboard.list": { params: { query?: string; kind?: ClipboardItemKind | "all"; limit?: number; offset?: number }; result: { items: ClipboardItem[]; total: number } };
  "clipboard.get": { params: { id: string }; result: ClipboardItem | null };
  "clipboard.paste": { params: { id: string; plainText?: boolean }; result: Void };
  "clipboard.copy": { params: { id: string; plainText?: boolean }; result: Void };
  "clipboard.pin": { params: { id: string; pinned: boolean }; result: Void };
  "clipboard.delete": { params: { id: string }; result: Void };
  "clipboard.clear": { params: { includePinned?: boolean }; result: Void };
  /** Paste each item in order on successive ⌘V (Raycast "Paste Sequentially"). */
  "clipboard.pasteSequentially": { params: { ids: string[] }; result: Void };

  // ---- snippets ------------------------------------------------------------------------
  "snippets.list": { params: { query?: string }; result: Snippet[] };
  "snippets.get": { params: { id: string }; result: Snippet | null };
  "snippets.create": { params: Omit<Snippet, "id" | "createdAt" | "updatedAt">; result: Snippet };
  "snippets.update": { params: { id: string; patch: Partial<Omit<Snippet, "id" | "createdAt" | "updatedAt">> }; result: Snippet };
  "snippets.delete": { params: { id: string }; result: Void };
  /** Expand placeholders without side effects (preview). */
  "snippets.render": { params: { text: string; arguments?: Record<string, string> }; result: { text: string; cursorOffset?: number; arguments: { name: string; default?: string }[] } };
  "snippets.paste": { params: { id: string; arguments?: Record<string, string> }; result: Void };
  "snippets.copy": { params: { id: string; arguments?: Record<string, string> }; result: Void };
  "snippets.import": { params: { json: string }; result: { imported: number; skipped: number } };
  "snippets.export": { params: Void; result: { json: string } };

  // ---- quicklinks ------------------------------------------------------------------------
  "quicklinks.list": { params: { query?: string }; result: Quicklink[] };
  "quicklinks.create": { params: Omit<Quicklink, "id" | "createdAt" | "updatedAt">; result: Quicklink };
  "quicklinks.update": { params: { id: string; patch: Partial<Omit<Quicklink, "id" | "createdAt" | "updatedAt">> }; result: Quicklink };
  "quicklinks.delete": { params: { id: string }; result: Void };
  /** Resolve placeholders (query/arguments/clipboard/selection) and open. */
  "quicklinks.open": { params: { id: string; query?: string; arguments?: Record<string, string> }; result: Void };
  "quicklinks.resolve": { params: { link: string; query?: string; arguments?: Record<string, string> }; result: { url: string; arguments: { name: string; default?: string; options?: string[] }[] } };
  "quicklinks.import": { params: { json: string }; result: { imported: number; skipped: number } };
  "quicklinks.export": { params: Void; result: { json: string } };

  // ---- notes ---------------------------------------------------------------------------------
  "notes.list": { params: { query?: string }; result: NoteSummary[] };
  "notes.get": { params: { id: string }; result: Note | null };
  "notes.create": { params: { content?: string }; result: Note };
  "notes.update": { params: { id: string; content?: string; pinned?: boolean; caret?: number }; result: Note };
  "notes.delete": { params: { id: string }; result: Void };
  "notes.recent": { params: Void; result: Note | null };
  "notes.export": { params: { id: string; format: "markdown" | "text" }; result: { content: string; fileName: string } };

  // ---- emoji / files / system / windows / calendar / menus --------------------------------------
  "emoji.search": { params: { query?: string; category?: string }; result: { sections: { title: string; items: EmojiItem[] }[] } };
  "emoji.recordUse": { params: { emoji: string }; result: Void };
  "files.search": { params: { query: string; limit?: number; scope?: string[] }; result: FileResult[] };
  "files.recent": { params: { limit?: number }; result: FileResult[] };
  "system.processes": { params: Void; result: ProcessInfo[] };
  "system.killProcess": { params: { pid: number; force?: boolean }; result: Void };
  "system.run": { params: { action: string; value?: unknown }; result: Void };
  "windows.run": { params: { command: WindowCommand }; result: Void };
  "windows.layouts.list": { params: Void; result: WindowLayout[] };
  "windows.layouts.upsert": { params: Omit<WindowLayout, "createdAt" | "updatedAt"> & { id?: string } | Omit<WindowLayout, "id" | "createdAt" | "updatedAt"> & { id?: string }; result: WindowLayout };
  "windows.layouts.delete": { params: { id: string }; result: Void };
  "windows.layouts.apply": { params: { id: string }; result: Void };
  "calendar.events": { params: { from: string; to: string }; result: CalendarEvent[] };
  "menus.list": { params: Void; result: { app: string; items: MenuItemInfo[] } };
  "menus.press": { params: { path: string[] }; result: Void };

  // ---- AI: providers & models -------------------------------------------------------------------
  "ai.providers.list": { params: Void; result: (AIProvider & { hasApiKey: boolean })[] };
  "ai.providers.templates": { params: Void; result: { id: string; name: string; api: AIProvider["api"]; supportedApis?: AIProvider["api"][]; baseUrl: string; needsApiKey: boolean; docsUrl?: string; keyUrl?: string }[] };
  "ai.providers.upsert": { params: { provider: Partial<AIProvider> & { name: string; template: string; api: AIProvider["api"]; baseUrl: string }; apiKey?: string | null }; result: AIProvider };
  "ai.providers.delete": { params: { id: string }; result: Void };
  "ai.providers.test": { params: { id: string }; result: { ok: boolean; message: string; latencyMs?: number } };
  "ai.providers.refreshModels": { params: { id: string }; result: AIProvider };
  "ai.models.list": { params: { includeDisabled?: boolean }; result: AIModelOption[] };

  // ---- AI: chats ----------------------------------------------------------------------------
  "ai.chats.list": { params: { query?: string; includeArchived?: boolean; source?: AIChat["source"] }; result: AIChat[] };
  "ai.chats.get": { params: { id: string }; result: { chat: AIChat; messages: AIMessage[] } | null };
  "ai.chats.create": { params: { presetId?: string; model?: ModelRef; source?: AIChat["source"]; title?: string }; result: AIChat };
  "ai.chats.update": { params: { id: string; patch: Partial<Pick<AIChat, "title" | "pinned" | "archived" | "model" | "presetId" | "creativity" | "webSearch" | "tools" | "folderId" | "currentLeafId" | "source" | "reasoningEffort" | "systemInstructions">> }; result: AIChat };
  "ai.chats.delete": { params: { id: string }; result: Void };
  "ai.chats.export": { params: { id: string; format: "markdown" | "json" }; result: { content: string; fileName: string } };
  /**
   * Send a user message (or regenerate when `regenerateMessageId` is set, or
   * edit when `editMessageId` is set). Streams via "ai.stream".
   */
  "ai.chats.send": {
    params: { chatId: string; content: string; attachments?: AIAttachment[]; model?: ModelRef; editMessageId?: string; regenerateMessageId?: string };
    result: { streamId: string; userMessageId?: string; assistantMessageId: string };
  };
  "ai.stop": { params: { streamId: string }; result: Void };
  "ai.confirmTool": { params: { streamId: string; callId: string; approved: boolean; always?: boolean }; result: Void };

  // ---- AI: quick AI / commands / presets / tools / MCP -----------------------------------------
  /** One-shot ask without a stored chat (used by Quick AI before "Continue in Chat" and by AI.ask). */
  "ai.ask": { params: { prompt: string; system?: string; model?: ModelRef; creativity?: Creativity; attachments?: AIAttachment[]; chatId?: string }; result: { streamId: string; chatId?: string } };
  "ai.commands.list": { params: Void; result: AICommand[] };
  "ai.commands.upsert": { params: Partial<AICommand> & { name: string; prompt: string }; result: AICommand };
  "ai.commands.delete": { params: { id: string }; result: Void };
  "ai.commands.reset": { params: { id: string }; result: AICommand };
  /** Expand placeholders (selection, clipboard, arguments) and run. Output mode decides where the text goes. */
  "ai.commands.run": { params: { id: string; arguments?: Record<string, string>; selection?: string; input?: { selectedText?: string } }; result: { streamId: string; chatId?: string; prompt: string } };
  "ai.commands.import": { params: { json: string }; result: { imported: number } };
  "ai.commands.export": { params: Void; result: { json: string } };
  "ai.presets.list": { params: Void; result: AIPreset[] };
  "ai.presets.upsert": { params: Partial<AIPreset> & { name: string }; result: AIPreset };
  "ai.presets.delete": { params: { id: string }; result: Void };
  "ai.tools.list": { params: Void; result: AIToolInfo[] };
  "ai.mcp.list": { params: Void; result: (MCPServer & { status: "connected" | "disconnected" | "error"; toolCount: number; error?: string })[] };
  "ai.mcp.upsert": { params: Partial<MCPServer> & { name: string; transport: MCPServer["transport"] }; result: MCPServer };
  "ai.mcp.delete": { params: { id: string }; result: Void };
  "ai.mcp.import": { params: { json: string }; result: { imported: number } };
  "ai.mcp.test": { params: { id: string }; result: { ok: boolean; message: string; tools: string[] } };

  // ---- extensions ---------------------------------------------------------------------------------
  "extensions.list": { params: Void; result: InstalledExtension[] };
  "extensions.store.search": { params: { query?: string; category?: string; page?: number }; result: { items: StoreExtension[]; hasMore: boolean } };
  "extensions.store.get": { params: { idOrSlug: string }; result: StoreExtension & { readme?: string } };
  "extensions.install": { params: { source: "store"; idOrSlug: string } | { source: "local"; path: string }; result: InstalledExtension };
  "extensions.uninstall": { params: { name: string }; result: Void };
  "extensions.update": { params: { name?: string }; result: { updated: string[] } };
  "extensions.setEnabled": { params: { name: string; enabled: boolean }; result: Void };
  "extensions.getPreferences": { params: { name: string; command?: string }; result: { values: Record<string, unknown>; missingRequired: string[] } };
  "extensions.setPreferences": { params: { name: string; command?: string; values: Record<string, unknown> }; result: Void };
  /** Start watching a local extension folder (`ray develop` equivalent). */
  "extensions.develop": { params: { path: string }; result: InstalledExtension };

  // ---- extension sessions (view commands) -----------------------------------------------------------
  "ext.session.start": { params: { name: string; command: string; arguments?: Record<string, string>; fallbackText?: string; launchContext?: Record<string, unknown>; draftValues?: Record<string, unknown>; launchType?: "userInitiated" | "background" }; result: LaunchResult };
  "ext.session.dispatch": { params: { sessionId: string; handlerId: string; args?: unknown[] }; result: unknown };
  /** User pressed Esc / back: pop the extension's own stack, or close the session at depth 1. */
  "ext.session.pop": { params: { sessionId: string }; result: { closed: boolean } };
  "ext.session.close": { params: { sessionId: string }; result: Void };
  "ext.session.state": { params: { sessionId: string }; result: ExtensionSessionState | null };
  /** Frontend answers a runtime confirmAlert. */
  "ext.alert.respond": { params: { alertId: string; confirmed: boolean }; result: Void };
  /** Frontend reports a form's current values (for Form drafts / onChange plumbing). */
  "ext.toast.action": { params: { sessionId: string; toastId: string; action: "primary" | "secondary" }; result: Void };

  // ---- script commands -----------------------------------------------------------------------------
  "scripts.reload": { params: Void; result: Void };
  "scripts.start": { params: { path: string; arguments?: string[] }; result: { executionId: string } };
  "scripts.cancel": { params: { executionId: string }; result: Void };
  "scripts.list": { params: Void; result: ScriptCommand[] };
  "scripts.directories.add": { params: { path: string }; result: Void };
  "scripts.directories.remove": { params: { path: string }; result: Void };
  "scripts.create": { params: { directory: string; title: string; mode: ScriptCommand["mode"]; language: "bash" | "python" | "node" | "applescript" | "swift" | "ruby"; packageName?: string; icon?: string }; result: ScriptCommand };
  "scripts.run": { params: { path: string; arguments?: string[] }; result: { exitCode: number; output: string; lastLine: string } };

  // ---- themes ------------------------------------------------------------------------------------------
  "themes.list": { params: Void; result: Theme[] };
  "themes.upsert": { params: Partial<Theme> & { name: string; appearance: Theme["appearance"]; colors: Theme["colors"] }; result: Theme };
  "themes.delete": { params: { id: string }; result: Void };

  // ---- sync -------------------------------------------------------------------------------------------
  "sync.status": { params: Void; result: SyncStatus };
  /** Connect to a server; creates the vault if empty or unlocks it with the passphrase. */
  "sync.connect": { params: { serverUrl: string; token: string; passphrase: string; deviceName?: string }; result: SyncStatus };
  "sync.disconnect": { params: { forgetKeys?: boolean }; result: Void };
  "sync.now": { params: Void; result: SyncStatus };
  "sync.devices": { params: Void; result: SyncDevice[] };
  "sync.removeDevice": { params: { deviceId: string }; result: Void };
  "sync.setCategoryEnabled": { params: { category: string; enabled: boolean }; result: Void };
  "sync.wipeRemote": { params: { confirm: "wipe" }; result: Void };

  // ---- import / export --------------------------------------------------------------------------------
  /** Import a Raycast .rayconfig export (v3 container, older JSON wrapper, or classic). */
  "data.importRayconfig": { params: { path: string; password?: string; categories?: string[] }; result: { results: { category: string; imported: number; error?: string }[] } };
  "data.storage": { params: Void; result: { totalBytes: number; databaseBytes: number; clipboardBytes: number; entities: Record<string, number>; clipboardItems: number } };
  "data.export": { params: { path: string; password?: string; categories?: string[] }; result: { path: string } };
  "data.import": { params: { path: string; password?: string }; result: { results: { category: string; imported: number; error?: string }[] } };

  // ---- misc ----------------------------------------------------------------------------------------
  "hud.show": { params: { text: string }; result: Void };
  "deeplink.open": { params: { url: string }; result: LaunchResult | null };
}

export type BackendMethod = keyof BackendMethods;
export type BackendParams<M extends BackendMethod> = BackendMethods[M]["params"];
export type BackendResult<M extends BackendMethod> = BackendMethods[M]["result"];

/** Push events (topic → payload). */
export interface BackendEvents {
  "settings.changed": { key: string; value: unknown };
  /** Any EntityStore change; frontends refetch the affected lists. */
  "entities.changed": { collection: string; ids: string[]; source: "local" | "sync" };
  "commands.changed": { reason: string };
  "clipboard.changed": { item: ClipboardItem };
  "clipboard.itemsChanged": { ids: string[]; deleted?: boolean };
  "notes.changed": { id: string; deleted?: boolean };
  "ai.stream": AIStreamEvent;
  "ai.chats.changed": { chatId: string };
  "ai.providers.changed": Record<string, never>;
  "ai.mcp.changed": Record<string, never>;
  "extensions.changed": Record<string, never>;
  /** Extension view tree / loading state changed. */
  "ext.session.updated": ExtensionSessionState;
  "ext.session.closed": { sessionId: string; reason: "completed" | "error" | "user" | "popToRoot"; error?: string };
  "ext.toast": { sessionId?: string; toast: ToastState | null };
  "ext.alert": { sessionId: string; alertId: string; options: AlertOptions };
  "ext.ui.control": { sessionId: string; action: "focus" | "reset" | "shake" | "clearSearchBar"; itemId?: string };
  /** The backend or an extension asks the launcher to navigate. */
  "launcher.navigate": { action: "popToRoot" | "close" | "show" | "launch"; result?: LaunchResult; clearSearchBar?: boolean };
  "launcher.toast": { toast: ToastState | null };
  "sync.status": SyncStatus;
  "themes.changed": Record<string, never>;
  "scripts.output": { executionId: string; stream: "stdout" | "stderr"; chunk: string };
  "scripts.completed": { executionId: string; exitCode: number; output: string; lastLine: string; durationMs: number; error?: string };
}

export type BackendEventTopic = keyof BackendEvents;
