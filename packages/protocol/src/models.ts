/**
 * Domain models shared by backend and frontend. Timestamps are ms since epoch
 * unless the field name ends in "Iso".
 *
 * Entities marked "(entity: <collection>)" are stored in the backend's
 * EntityStore under that collection name and may sync.
 */

import type { Hotkey, ImageLike, KeyboardShortcut, UINode } from "./ui";
import type { AppInfo } from "./native";

// ---------------------------------------------------------------------------
// Commands and root search
// ---------------------------------------------------------------------------

/**
 * Stable command ids:
 *   builtin:<extension>.<command>      e.g. builtin:clipboard.clipboardHistory
 *   app:<bundleId or path>             e.g. app:com.apple.Safari
 *   ext:<extensionName>.<command>      e.g. ext:github.my-pull-requests
 *   script:<absolute path>
 *   quicklink:<id>
 *   snippet:<id>
 *   ai-command:<id>
 *   ai-preset:<id>
 *   window-layout:<id>
 */
export type CommandId = string;

export type CommandKind = "builtin" | "app" | "extension" | "script" | "quicklink" | "snippet" | "ai-command" | "ai-preset" | "window-layout";

export type CommandMode = "view" | "no-view" | "menu-bar";

export interface CommandArgument {
  name: string;
  type: "text" | "password" | "dropdown";
  placeholder: string;
  required?: boolean;
  data?: { title: string; value: string }[];
}

/** User customizations for any command (entity: commandPrefs, id = CommandId). */
export interface CommandPrefs {
  alias?: string;
  hotkey?: Hotkey;
  /** Lower comes first; undefined = not a favorite. */
  favoriteOrder?: number;
  /** Position in fallback list; undefined = not a fallback. */
  fallbackOrder?: number;
  enabled?: boolean;
  /** Extension command preference values (non-secret). */
  preferences?: Record<string, unknown>;
  /** Background refresh enabled for interval commands. */
  intervalEnabled?: boolean;
}

/** One row in root search and in Settings → Extensions. */
export interface CommandInfo {
  id: CommandId;
  kind: CommandKind;
  title: string;
  /** Usually the extension title ("Clipboard History", "Raycast AI"); app path for apps. */
  subtitle?: string;
  /** Right-side type label: "Application", "Command", "Quicklink", "Snippet", "AI Command", "Script Command", "Window Layout". */
  typeLabel: string;
  icon: ImageLike;
  keywords?: string[];
  mode: CommandMode;
  arguments?: CommandArgument[];
  /** Extension (group) this command belongs to. */
  extensionId?: string;
  extensionTitle?: string;
  description?: string;
  /** Effective customizations. */
  alias?: string;
  hotkey?: Hotkey;
  favorite?: boolean;
  enabled: boolean;
  /** Present for menu-bar / interval commands. */
  interval?: string;
  /** Can this command take the root search text as input (fallback)? */
  acceptsFallbackText?: boolean;
  /** Command needs setup (missing required preferences). */
  needsPreferences?: boolean;
}

export interface RootSearchItem extends CommandInfo {
  /** Matched character ranges in title, for highlighting. */
  matches?: [number, number][];
  /** Extra right-side accessories (e.g. "Running", hotkey). */
  accessories?: { text?: string; icon?: ImageLike; tooltip?: string }[];
  score?: number;
  /** Applications: the app is running (the launcher draws a dot under the icon). */
  running?: boolean;
}

export interface CalculatorResult {
  input: string;
  /** Pretty-printed input as interpreted ("2 m in ft"). */
  interpreted: string;
  result: string;
  /** Raw value to copy (no grouping separators). */
  copyValue: string;
  /** Unit or category label shown under the result ("Feet", "USD", "Sunday"). */
  resultLabel?: string;
  inputLabel?: string;
  kind: "math" | "unit" | "currency" | "date" | "timezone" | "percentage" | "color" | "base";
  /** For colors: hex swatch. */
  color?: string;
}

export interface RootSearchSection {
  id: "favorites" | "suggestions" | "results" | "commands" | "use-with" | string;
  title: string;
  items: RootSearchItem[];
}

export interface RootSearchResult {
  query: string;
  calculator?: CalculatorResult;
  sections: RootSearchSection[];
  /** Fallback commands, shown under "Use “<query>” with…" when the query is non-empty. */
  fallbacks: RootSearchItem[];
}

/** What happens when the user runs a command. */
export type LaunchResult =
  | { kind: "view"; view: BuiltinView }
  | { kind: "extension"; sessionId: string; mode: CommandMode }
  | { kind: "ai"; aiCommandId?: string; prompt?: string; presetId?: string; target: "quick-ai" | "chat" }
  | { kind: "done"; hud?: string; closeWindow: boolean; popToRoot?: boolean }
  | { kind: "error"; message: string };

/** Built-in React views the frontend renders natively. */
export interface BuiltinView {
  /** e.g. "clipboard-history", "snippets.search", "snippets.create", "quicklinks.create", "emoji", "file-search", "notes.search", "ai.commands", "store", "extensions", "calendar", "menu-items", "scripts", "window-management", "theme-studio", "translator" */
  id: string;
  props?: Record<string, unknown>;
  /** Navigation title. */
  title?: string;
}

// ---------------------------------------------------------------------------
// Snippets, quicklinks, notes
// ---------------------------------------------------------------------------

/** (entity: snippets) */
export interface Snippet {
  id: string;
  name: string;
  /** Text with dynamic placeholders, e.g. "Hi {clipboard}, {date format=\"yyyy-MM-dd\"}{cursor}". */
  text: string;
  keyword?: string;
  /** Icon enum value shown next to the snippet (default "blank-document-16"). */
  icon?: string;
  pinned?: boolean;
  tags?: string[];
  copyCount?: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** (entity: quicklinks) */
export interface Quicklink {
  id: string;
  name: string;
  /** URL, file path, or app URL with placeholders: {query}, {argument name="x" default="y"}, {clipboard}, {selection}, {date}, {uuid}. */
  link: string;
  /** Bundle id or path of the app to open with; undefined = default handler. */
  openWith?: string;
  icon?: ImageLike;
  tags?: string[];
  openCount?: number;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** (entity: notes) */
export interface Note {
  id: string;
  /** First line of the note, derived on save. */
  title: string;
  /** Markdown source. */
  content: string;
  pinned?: boolean;
  /** Cursor position for restore. */
  caret?: number;
  lastOpenedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  pinned?: boolean;
  characters: number;
  words: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
}

// ---------------------------------------------------------------------------
// Clipboard history (local table, never synced)
// ---------------------------------------------------------------------------

export type ClipboardItemKind = "text" | "link" | "image" | "file" | "color";

export interface ClipboardItem {
  id: string;
  kind: ClipboardItemKind;
  /** Title shown in the list (first line, file name, "Image (1280×800)"). */
  title: string;
  text?: string;
  html?: string;
  filePaths?: string[];
  imagePath?: string;
  imageWidth?: number;
  imageHeight?: number;
  /** Text recognized in images (OCR). */
  ocrText?: string;
  color?: string;
  url?: string;
  sourceApp?: AppInfo;
  pinned: boolean;
  copyCount: number;
  characters?: number;
  words?: number;
  byteSize?: number;
  contentHash: string;
  createdAt: number;
  lastCopiedAt: number;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

/** How Surgecast talks to a provider. */
export type AIProviderApi = "openai" | "anthropic" | "google" | "ollama";

/** (entity: aiProviders) API keys are in the Keychain at "ai.provider:<id>:apiKey". */
export interface AIProvider {
  id: string;
  name: string;
  /** Template the provider was created from: "openai", "anthropic", "google", "openrouter", "groq", "mistral", "xai", "deepseek", "together", "fireworks", "perplexity", "ollama", "lmstudio", "cliproxyapi", "litellm", "custom". */
  template: string;
  api: AIProviderApi;
  /** e.g. https://api.openai.com/v1, http://127.0.0.1:8317/v1 */
  baseUrl: string;
  headers?: Record<string, string>;
  enabled: boolean;
  /** Fetch the model list from the provider (GET /models) and merge with manual models. */
  autoFetchModels: boolean;
  models: AIModel[];
  createdAt: number;
  updatedAt: number;
}

export interface AIModelCapabilities {
  vision?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  webSearch?: boolean;
  pdf?: boolean;
  imageGeneration?: boolean;
}

export interface AIModel {
  /** Model id sent to the provider, e.g. "gpt-5.1", "claude-sonnet-5-5". */
  id: string;
  /** Display name. */
  name: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  capabilities: AIModelCapabilities;
  /** Shown in model pickers. */
  enabled: boolean;
  /** Added by hand rather than fetched. */
  manual?: boolean;
}

/** "<providerId>/<modelId>" */
export type ModelRef = string;

export interface AIModelOption {
  ref: ModelRef;
  providerId: string;
  providerName: string;
  modelId: string;
  name: string;
  capabilities: AIModelCapabilities;
  contextWindow?: number;
}

export type Creativity = "none" | "low" | "medium" | "high" | "maximum";

export interface AIAttachment {
  id: string;
  kind: "image" | "file" | "text" | "url" | "selection" | "screenshot";
  name: string;
  mimeType?: string;
  /** Local path (images/files) — the backend reads it when sending. */
  path?: string;
  /** Inline text content (selection, small text files, fetched URL text). */
  text?: string;
  url?: string;
  size?: number;
}

export interface AIToolCall {
  id: string;
  /** "<toolset>.<tool>", e.g. "web.search", "ext:github.search-issues", "mcp:linear.create_issue". */
  name: string;
  title?: string;
  arguments: Record<string, unknown>;
  status: "pending" | "awaiting-confirmation" | "running" | "done" | "error" | "rejected";
  result?: unknown;
  error?: string;
}

/** (entity: aiMessages) */
export interface AIMessage {
  id: string;
  chatId: string;
  /** Previous message in this branch; editing a user message creates a sibling with the same parent. */
  parentId?: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: AIAttachment[];
  toolCalls?: AIToolCall[];
  model?: ModelRef;
  status: "complete" | "streaming" | "error" | "stopped";
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number };
  createdAt: number;
  updatedAt: number;
}

/** (entity: aiChats) */
export interface AIChat {
  id: string;
  title: string;
  /** Leaf message id of the visible branch. */
  currentLeafId?: string;
  presetId?: string;
  model?: ModelRef;
  creativity?: Creativity;
  webSearch?: boolean;
  /** Enabled tool sets for this chat ("web", "ext:<name>", "mcp:<serverId>"). */
  tools?: string[];
  pinned?: boolean;
  archived?: boolean;
  folderId?: string;
  source: "chat" | "quick-ai" | "ai-command";
  createdAt: number;
  updatedAt: number;
}

/** A Raycast "Preset" / "Agent": reusable chat setup. (entity: aiPresets) */
export interface AIPreset {
  id: string;
  name: string;
  icon?: ImageLike;
  description?: string;
  instructions: string;
  model?: ModelRef;
  creativity: Creativity;
  webSearch: boolean;
  tools: string[];
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AICommandOutput = "window" | "quick-ai" | "paste" | "copy" | "replace";

/** (entity: aiCommands) */
export interface AICommand {
  id: string;
  name: string;
  icon?: ImageLike;
  /** Prompt with placeholders: {selection}, {clipboard}, {argument name="x"}, {browser-tab}, {date}, {time}, {focused-app}. */
  prompt: string;
  model?: ModelRef;
  creativity: Creativity;
  output: AICommandOutput;
  webSearch?: boolean;
  /** Built-in commands ship with Surgecast; they can be edited and reset. */
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** (entity: mcpServers) Secrets in env/headers are stored in the Keychain at "mcp:<id>:env:<NAME>" / "mcp:<id>:header:<Name>". */
export interface MCPServer {
  id: string;
  name: string;
  /** Used for @-mentions. */
  mentionName: string;
  description?: string;
  icon?: ImageLike;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AIToolInfo {
  /** Fully qualified tool name. */
  name: string;
  title: string;
  description: string;
  /** "web", "ext:<extensionName>", "mcp:<serverId>", "builtin" */
  toolset: string;
  toolsetTitle: string;
  icon?: ImageLike;
  inputSchema: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

/** One streamed chunk for a running AI request. */
export type AIStreamEvent =
  | { type: "start"; streamId: string; chatId?: string; messageId?: string; model: ModelRef }
  | { type: "text"; streamId: string; delta: string }
  | { type: "reasoning"; streamId: string; delta: string }
  | { type: "tool-call"; streamId: string; call: AIToolCall }
  | { type: "tool-result"; streamId: string; call: AIToolCall }
  | { type: "title"; streamId: string; chatId: string; title: string }
  | { type: "done"; streamId: string; usage?: AIMessage["usage"]; finishReason?: string }
  | { type: "error"; streamId: string; message: string; status?: number };

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

export interface ExtensionPreference {
  name: string;
  title?: string;
  description?: string;
  type: "textfield" | "password" | "checkbox" | "dropdown" | "appPicker" | "file" | "directory";
  required: boolean;
  default?: unknown;
  placeholder?: string;
  label?: string;
  data?: { title: string; value: string }[];
}

export interface ExtensionCommandManifest {
  name: string;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: string;
  mode: CommandMode;
  interval?: string;
  keywords?: string[];
  arguments?: CommandArgument[];
  preferences?: ExtensionPreference[];
  disabledByDefault?: boolean;
}

export interface ExtensionToolManifest {
  name: string;
  title: string;
  description: string;
  icon?: string;
}

/** (entity: extensions, id = extension name) Installed Raycast-compatible extension. */
export interface InstalledExtension {
  /** package.json "name", unique per install. */
  name: string;
  id?: string;
  title: string;
  description?: string;
  author: string;
  owner?: string;
  icon?: string;
  version?: string;
  source: "store" | "local" | "development";
  /** Absolute install path (device-specific; resolved locally). */
  path?: string;
  commands: ExtensionCommandManifest[];
  tools: ExtensionToolManifest[];
  preferences: ExtensionPreference[];
  aiInstructions?: string;
  enabled: boolean;
  installedAt: number;
  updatedAt: number;
}

export interface StoreExtension {
  id: string;
  name: string;
  title: string;
  description: string;
  author: { handle: string; name: string; avatar?: string };
  owner?: { handle: string; name: string };
  icon: { light?: string; dark?: string };
  downloadCount: number;
  categories: string[];
  commands: { name: string; title: string; description?: string; mode: CommandMode }[];
  tools?: { name: string; title: string; description?: string }[];
  platforms?: string[];
  version?: string;
  updatedAt: number;
  storeUrl: string;
  sourceUrl?: string;
  readmeUrl?: string;
  screenshots?: string[];
  installed?: boolean;
  installedVersion?: string;
}

/** State of an extension view session, pushed to the frontend. */
export interface ExtensionSessionState {
  sessionId: string;
  extensionName: string;
  commandName: string;
  mode: CommandMode;
  /** Top of the navigation stack (null while the command has not rendered yet). */
  root: UINode | null;
  /** Depth of the extension's own navigation stack (1 = command root). */
  depth: number;
  isLoading: boolean;
  navigationTitle?: string;
}

// ---------------------------------------------------------------------------
// Script commands
// ---------------------------------------------------------------------------

export interface ScriptCommand {
  path: string;
  title: string;
  mode: "fullOutput" | "compact" | "silent" | "inline";
  packageName?: string;
  icon?: string;
  iconDark?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  refreshTime?: string;
  needsConfirmation?: boolean;
  currentDirectoryPath?: string;
  arguments: (CommandArgument & { percentEncoded?: boolean; secure?: boolean })[];
  language?: string;
}

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

/** (entity: windowLayouts) A custom window command: fractional rect of the visible screen. */
export interface WindowLayout {
  id: string;
  name: string;
  icon?: ImageLike;
  rect: { x: number; y: number; width: number; height: number };
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/** (entity: themes) */
export interface Theme {
  id: string;
  name: string;
  appearance: "dark" | "light";
  colors: {
    background: string;
    backgroundSecondary: string;
    text: string;
    selection: string;
    loader: string;
    red: string;
    orange: string;
    yellow: string;
    green: string;
    blue: string;
    purple: string;
    magenta: string;
  };
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Emoji, files, calendar
// ---------------------------------------------------------------------------

export interface EmojiItem {
  emoji: string;
  name: string;
  keywords: string[];
  category: string;
  /** Skin-tone variants if any. */
  skins?: string[];
}

export interface FileResult {
  path: string;
  name: string;
  kind?: string;
  modified?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncPhase = "disabled" | "offline" | "connecting" | "initial-sync" | "online" | "error" | "needs-passphrase";

export interface SyncStatus {
  phase: SyncPhase;
  serverUrl?: string;
  deviceId: string;
  deviceName: string;
  lastSyncedAt?: number;
  lastError?: string;
  pendingChanges: number;
  /** Per-category local entity counts. */
  counts: Record<string, number>;
}

export interface SyncDevice {
  deviceId: string;
  name: string;
  platform: string;
  appVersion?: string;
  lastSeenAt?: number;
  current: boolean;
}

// ---------------------------------------------------------------------------
// Toast / HUD shown by the backend in the launcher footer
// ---------------------------------------------------------------------------

export interface FooterToast {
  id: string;
  style: "animated" | "success" | "failure";
  title: string;
  message?: string;
  primaryAction?: { title: string; shortcut?: KeyboardShortcut };
}
