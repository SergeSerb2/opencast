import type {
  AIAttachment,
  AIModelOption,
  AIStreamEvent,
  AIToolCall,
  AIToolInfo,
  BackendEvents,
  BackendMethods,
  CommandInfo,
  Creativity,
  LaunchResult,
  ModelRef,
  ToastState,
} from "@opencast/protocol";
import type { Database } from "./db/database";
import type { EntityStore } from "./db/entities";
import type { EventBus } from "./events";
import type { NativeApi } from "./native/client";
import type { RpcRegistry } from "./rpc/registry";
import type { HttpRoute } from "./rpc/ws-server";
import type { Logger } from "./util/log";
import type { SettingsService } from "./services/settings";
import type { SecretsService } from "./services/secrets";

/**
 * Everything a service needs. Services are plain modules exporting
 * `register(ctx)`; they add migrations, RPC handlers and event listeners.
 */
export interface AppContext {
  dataDir: string;
  /** Contents/Resources of the app bundle, or the repo root in dev. */
  resourcesDir: string;
  dev: boolean;
  version: string;
  db: Database;
  entities: EntityStore;
  settings: SettingsService;
  secrets: SecretsService;
  /** Root search command registry (built-ins, apps, extensions, quicklinks, ...). */
  commands: CommandRegistry;
  /** AI completion engine (implemented by the ai service). */
  ai: AIEngine;
  /** Tools the AI can call (web search, extension tools, MCP). */
  tools: ToolRegistry;
  /** Drive the launcher UI from the backend (toasts in the footer, HUD, navigation). */
  launcher: LauncherApi;
  native: NativeApi;
  events: EventBus;
  rpc: RpcRegistry<BackendMethods>;
  log: Logger;
  /** Authenticated HTTP route on the backend's port (dev images, downloads). */
  registerHttpRoute(path: string, route: HttpRoute): void;
  /** Run once after every service registered and migrations ran. */
  onReady(fn: () => void | Promise<void>): void;
  /** Run on shutdown (SIGTERM / native disconnect). */
  onShutdown(fn: () => void | Promise<void>): void;
}

export interface Service {
  name: string;
  register(ctx: AppContext): void;
}

// ---------------------------------------------------------------------------
// Cross-service interfaces
// ---------------------------------------------------------------------------

export interface LaunchRequest {
  arguments?: Record<string, string>;
  fallbackText?: string;
  launchContext?: Record<string, unknown>;
  source: "root" | "hotkey" | "deeplink" | "fallback" | "alias" | "background" | "extension";
}

/** A source of commands for root search. Each service registers one. */
export interface CommandProvider {
  /** "builtin", "apps", "extensions", "scripts", "quicklinks", "snippets", "ai-commands", "window-layouts", ... */
  id: string;
  /** Commands without user prefs applied (registry merges alias/hotkey/favorite/enabled). */
  list(): CommandInfo[] | Promise<CommandInfo[]>;
  launch(command: CommandInfo, request: LaunchRequest): LaunchResult | Promise<LaunchResult>;
}

export interface CommandRegistry {
  registerProvider(provider: CommandProvider): void;
  /** Drop cached lists (one provider or all) and emit "commands.changed". */
  invalidate(providerId?: string): void;
  /** All commands with prefs applied. */
  all(options?: { includeDisabled?: boolean }): Promise<CommandInfo[]>;
  get(id: string): Promise<CommandInfo | undefined>;
  launch(id: string, request: LaunchRequest): Promise<LaunchResult>;
}

export interface AIChatTurn {
  reasoning?: string;
  /** Only replay provider reasoning to the model that produced it. */
  reasoningModel?: ModelRef;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  attachments?: AIAttachment[];
  /** Assistant turns that called tools. */
  toolCalls?: AIToolCall[];
  /** Tool result turns. */
  toolCallId?: string;
  name?: string;
}

export interface AICompletionRequest {
  messages: AIChatTurn[];
  system?: string;
  /** Falls back to the default for `purpose`. */
  model?: ModelRef;
  purpose?: "chat" | "quickAi" | "commands" | "title" | "extension";
  creativity?: Creativity;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /** Tools offered to the model; the engine runs the tool loop through ctx.tools. */
  tools?: AIToolInfo[];
  /** Ask the user before running a tool (UI confirmation via ai.confirmTool). */
  confirmTool?: (call: AIToolCall) => Promise<boolean>;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AICompletionResult {
  text: string;
  reasoning?: string;
  toolCalls: AIToolCall[];
  model: ModelRef;
  usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number };
  finishReason?: string;
}

export interface AIEngine {
  /** Stream one completion (with tool loop). `onEvent` gets text/reasoning/tool events without streamId. */
  complete(
    request: AICompletionRequest,
    onEvent?: (event: DistributiveOmit<AIStreamEvent, "streamId">) => void,
  ): Promise<AICompletionResult>;
  listModels(): Promise<AIModelOption[]>;
  /** The configured default model for a purpose, or the first enabled model. Null if no provider is set up. */
  defaultModel(purpose: NonNullable<AICompletionRequest["purpose"]>): Promise<ModelRef | null>;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface ToolProvider {
  /** "web", "ext", "mcp", "builtin" */
  id: string;
  list(): Promise<AIToolInfo[]>;
  call(name: string, args: Record<string, unknown>, options: { signal?: AbortSignal }): Promise<unknown>;
}

export interface ToolRegistry {
  registerProvider(provider: ToolProvider): void;
  list(): Promise<AIToolInfo[]>;
  call(name: string, args: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>;
}

export interface LauncherApi {
  /** Show a toast in the launcher footer (null hides). */
  toast(toast: ToastState | null): void;
  /** Close the launcher and show a HUD pill. */
  hud(text: string): Promise<void>;
  navigate(action: BackendEvents["launcher.navigate"]): void;
}
