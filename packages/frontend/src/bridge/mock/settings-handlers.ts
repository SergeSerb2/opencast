import {
  RpcErrorCode,
  SYNC_CATEGORIES,
  type AICommand,
  type AIPreset,
  type AIProvider,
  type AIToolInfo,
  type BackendEvents,
  type BackendMethod,
  type BackendParams,
  type BackendResult,
  type CommandInfo,
  type InstalledExtension,
  type MCPServer,
  type ScriptCommand,
  type SettingsValues,
  type SyncDevice,
  type SyncStatus,
  type Theme,
} from "@opencast/protocol";
import type { Emitter } from "../emitter";
import { RpcError } from "../errors";
import { BUILTIN_PALETTES } from "../../theme/palettes";
import { EXTENSIONS, PROVIDERS } from "./fixtures/content";

type Handlers = { [M in BackendMethod]?: (params: BackendParams<M>) => BackendResult<M> | Promise<BackendResult<M>> };
type ProviderRow = AIProvider & { hasApiKey: boolean };

export interface SettingsMockContext {
  settings: SettingsValues;
  commands: CommandInfo[];
  events: Emitter<BackendEvents>;
}

const now = Date.now();
const day = 86_400_000;

const fail = (message: string, code: number = RpcErrorCode.InvalidParams): never => {
  throw new RpcError({ code, message });
};

const PROVIDER_TEMPLATES: BackendResult<"ai.providers.templates"> = [
  {
    id: "openai",
    name: "OpenAI",
    api: "openai-responses",
    supportedApis: ["openai", "openai-responses"],
    baseUrl: "https://api.openai.com/v1",
    needsApiKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    api: "anthropic",
    supportedApis: ["anthropic"],
    baseUrl: "https://api.anthropic.com",
    needsApiKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    name: "Google Gemini",
    api: "google",
    supportedApis: ["google"],
    baseUrl: "https://generativelanguage.googleapis.com",
    needsApiKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
  },
  { id: "openrouter", name: "OpenRouter", api: "openai", supportedApis: ["openai"], baseUrl: "https://openrouter.ai/api/v1", needsApiKey: true, keyUrl: "https://openrouter.ai/keys" },
  { id: "groq", name: "Groq", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.groq.com/openai/v1", needsApiKey: true },
  { id: "mistral", name: "Mistral", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.mistral.ai/v1", needsApiKey: true },
  { id: "xai", name: "xAI", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.x.ai/v1", needsApiKey: true },
  { id: "deepseek", name: "DeepSeek", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.deepseek.com/v1", needsApiKey: true },
  { id: "together", name: "Together", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.together.xyz/v1", needsApiKey: true },
  { id: "fireworks", name: "Fireworks", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.fireworks.ai/inference/v1", needsApiKey: true },
  { id: "perplexity", name: "Perplexity", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.perplexity.ai", needsApiKey: true },
  { id: "cerebras", name: "Cerebras", api: "openai", supportedApis: ["openai"], baseUrl: "https://api.cerebras.ai/v1", needsApiKey: true },
  { id: "ollama", name: "Ollama", api: "openai", supportedApis: ["openai", "ollama"], baseUrl: "http://127.0.0.1:11434/v1", needsApiKey: false },
  { id: "lmstudio", name: "LM Studio", api: "openai", supportedApis: ["openai", "openai-responses"], baseUrl: "http://127.0.0.1:1234/v1", needsApiKey: false },
  { id: "cliproxyapi", name: "CLIProxyAPI", api: "openai", supportedApis: ["openai", "openai-responses"], baseUrl: "http://127.0.0.1:8317/v1", needsApiKey: false },
  { id: "litellm", name: "LiteLLM", api: "openai", supportedApis: ["openai", "openai-responses"], baseUrl: "http://127.0.0.1:4000/v1", needsApiKey: false },
  {
    id: "azure",
    name: "Azure OpenAI",
    api: "openai",
    supportedApis: ["openai"],
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT?api-version=2024-10-21",
    needsApiKey: true,
  },
  { id: "custom", name: "Custom OpenAI-compatible", api: "openai", supportedApis: ["openai", "openai-responses"], baseUrl: "http://127.0.0.1:8080/v1", needsApiKey: false },
];

/** Models a provider "discovers" on refresh, keyed by template. */
const DISCOVERABLE: Record<string, AIProvider["models"]> = {
  ollama: [{ id: "llama3.2:latest", name: "Llama 3.2", enabled: true, capabilities: { tools: true } }],
  openai: [{ id: "gpt-5.1-nano", name: "GPT-5.1 nano", contextWindow: 400_000, capabilities: { vision: true, tools: true }, enabled: false }],
  cliproxyapi: [
    { id: "claude-sonnet-5-5", name: "claude-sonnet-5-5", capabilities: { vision: true, tools: true, reasoning: true }, enabled: true },
    { id: "gpt-5.1-codex", name: "gpt-5.1-codex", capabilities: { tools: true, reasoning: true }, enabled: true },
    { id: "gemini-3-pro", name: "gemini-3-pro", capabilities: { vision: true, tools: true, reasoning: true }, enabled: true },
  ],
};

const MCP_SERVERS: (MCPServer & { status: "connected" | "disconnected" | "error"; toolCount: number; error?: string })[] = [
  {
    id: "mcp-fs",
    name: "Filesystem",
    mentionName: "filesystem",
    description: "Read and write files in ~/Projects",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "~/Projects"],
    enabled: true,
    createdAt: now - 20 * day,
    updatedAt: now - 2 * day,
    status: "connected",
    toolCount: 11,
  },
  {
    id: "mcp-linear",
    name: "Linear",
    mentionName: "linear",
    transport: "http",
    url: "https://mcp.linear.app/mcp",
    headers: { Authorization: "$keychain" },
    enabled: true,
    createdAt: now - 6 * day,
    updatedAt: now - 6 * day,
    status: "error",
    toolCount: 0,
    error: "401 Unauthorized — check the Authorization header",
  },
];

const AI_COMMANDS: AICommand[] = [
  {
    id: "improve-writing",
    name: "Improve Writing",
    icon: "pencil-16",
    prompt: "Rewrite the text below so it reads clearly and naturally. Keep the meaning, tone and language.\n\nText: {selection}",
    creativity: "low",
    output: "replace",
    builtin: true,
    createdAt: now - 90 * day,
    updatedAt: now - 90 * day,
  },
  {
    id: "fix-spelling",
    name: "Fix Spelling and Grammar",
    icon: "text-16",
    prompt: "Correct spelling, grammar and punctuation in the text below. Change nothing else.\n\nText: {selection}",
    creativity: "none",
    output: "replace",
    builtin: true,
    createdAt: now - 90 * day,
    updatedAt: now - 90 * day,
  },
  {
    id: "explain-simply",
    name: "Explain This in Simple Terms",
    icon: "light-bulb-16",
    prompt: "Explain the following so a curious beginner understands it. Use short sentences and one example.\n\n{selection}",
    creativity: "medium",
    output: "quick-ai",
    builtin: true,
    createdAt: now - 90 * day,
    updatedAt: now - 90 * day,
  },
  {
    id: "find-bugs",
    name: "Find Bugs in Code",
    icon: "bug-16",
    prompt: "Review this code for bugs and risky edge cases. List each problem with a fix.\n\n```\n{selection}\n```",
    creativity: "low",
    output: "window",
    builtin: true,
    createdAt: now - 90 * day,
    updatedAt: now - 90 * day,
  },
  {
    id: "cmd-commit",
    name: "Write Commit Message",
    icon: "code-16",
    prompt: "Write a conventional commit message for this diff:\n\n{clipboard}",
    model: "anthropic/claude-sonnet-5-5",
    creativity: "low",
    output: "copy",
    createdAt: now - 4 * day,
    updatedAt: now - 1 * day,
  },
];

const AI_PRESETS: AIPreset[] = [
  {
    id: "preset-research",
    name: "Deep Research",
    icon: "bolt-16",
    description: "Thorough answers with sources",
    instructions: "Research the question carefully, compare sources and cite them.",
    creativity: "low",
    webSearch: true,
    tools: ["web"],
    builtin: true,
    createdAt: now - 90 * day,
    updatedAt: now - 90 * day,
  },
  {
    id: "preset-coder",
    name: "Swift Reviewer",
    icon: "code-16",
    description: "Reviews Swift and AppKit code",
    instructions: "You are a senior macOS engineer. Point out concurrency and memory issues first.",
    model: "openai/gpt-5.1",
    creativity: "low",
    webSearch: false,
    tools: [],
    createdAt: now - 3 * day,
    updatedAt: now - 3 * day,
  },
];

const TOOLS: AIToolInfo[] = [
  { name: "web.search", title: "Search the Web", description: "Search the web with the configured provider", toolset: "web", toolsetTitle: "Web", inputSchema: {} },
  { name: "web.read", title: "Read Page", description: "Read the text of a web page", toolset: "web", toolsetTitle: "Web", inputSchema: {} },
  { name: "mcp:mcp-fs.read_file", title: "Read File", description: "Read a file", toolset: "mcp:mcp-fs", toolsetTitle: "Filesystem", inputSchema: {} },
  { name: "mcp:mcp-fs.write_file", title: "Write File", description: "Write a file", toolset: "mcp:mcp-fs", toolsetTitle: "Filesystem", inputSchema: {}, requiresConfirmation: true },
  { name: "ext:github.search-issues", title: "Search Issues", description: "Search GitHub issues", toolset: "ext:github", toolsetTitle: "GitHub", inputSchema: {} },
];

const DEVICES: SyncDevice[] = [
  { deviceId: "mock-device", name: "This Mac", platform: "macOS 27.2", appVersion: "0.1.0", lastSeenAt: now, current: true },
  { deviceId: "studio", name: "Mac Studio", platform: "macOS 27.1", appVersion: "0.1.0", lastSeenAt: now - 3 * 3_600_000, current: false },
];

const SYNC_COUNTS: Record<string, number> = {
  "ai-presets-commands": 9,
  "ai-history": 42,
  "mcp-servers": 2,
  quicklinks: 2,
  notes: 2,
  snippets: 3,
  "window-management-layouts": 1,
  extensions: 2,
};

const SCRIPTS: ScriptCommand[] = [
  { path: "/Users/me/scripts/uptime.sh", title: "System Uptime", mode: "fullOutput", packageName: "System", icon: "⏱️", arguments: [], language: "bash" },
  { path: "/Users/me/scripts/toggle-wifi.applescript", title: "Toggle Wi-Fi", mode: "silent", packageName: "Network", icon: "📶", arguments: [], language: "applescript" },
];

function builtinThemes(): Theme[] {
  return BUILTIN_PALETTES.map((p) => ({ id: p.id, name: p.name, appearance: p.appearance, colors: p.colors, builtin: true, createdAt: now - 100 * day, updatedAt: now - 100 * day }));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Mock backend handlers for the Settings window: providers and models, MCP,
 * AI commands/presets, sync, extensions, script folders, import/export.
 * Spread into the mock handler table after the foundation's handlers.
 */
export function settingsMockHandlers({ settings, commands, events }: SettingsMockContext): Handlers {
  let identity = 0;
  const newId = (prefix: string) => `${prefix}-${++identity}`;
  const providers: ProviderRow[] = structuredClone(PROVIDERS).concat([
    {
      id: "cliproxy",
      name: "CLIProxyAPI",
      template: "cliproxyapi",
      api: "openai",
      baseUrl: "http://127.0.0.1:8317/v1",
      enabled: true,
      autoFetchModels: true,
      hasApiKey: true,
      modelFetchError: "Could not reach http://127.0.0.1:8317/v1/models (connection refused)",
      models: [],
      createdAt: now - 2 * day,
      updatedAt: now - 2 * day,
    },
  ]);
  const mcp = structuredClone(MCP_SERVERS);
  const aiCommands = structuredClone(AI_COMMANDS);
  const presets = structuredClone(AI_PRESETS);
  const extensions: InstalledExtension[] = structuredClone(EXTENSIONS);
  const extensionPrefs = new Map<string, Record<string, unknown>>();
  const webSearchKeys = new Set<string>(["tavily"]);
  let backupHasPassphrase = false;
  const themes: Theme[] = [
    ...builtinThemes(),
    {
      id: "user-aurora",
      name: "Aurora",
      appearance: "dark",
      colors: {
        background: "#0B1A2A",
        backgroundSecondary: "#1B0B33",
        text: "#E8F6FF",
        selection: "#7BD8FF",
        loader: "#7BD8FF",
        red: "#FF6B7A",
        orange: "#FF9F5A",
        yellow: "#FFE16B",
        green: "#5BE7A9",
        blue: "#5AB8FF",
        purple: "#B08CFF",
        magenta: "#FF6FD2",
      },
      createdAt: now - 5 * day,
      updatedAt: now - 5 * day,
    },
  ];
  if (typeof location !== "undefined" && new URLSearchParams(location.search).get("mock.ai.empty") === "1") providers.length = 0;
  const syncParams = new URLSearchParams(typeof location === "undefined" ? "" : location.search);
  const stopped = syncParams.get("mock.sync.stopReason");
  const stopReason = stopped === "vault-changed" || stopped === "device-removed" ? stopped : undefined;
  if (stopReason) {
    settings["sync.enabled"] = false;
    settings["sync.serverUrl"] ??= "https://sync.example.workers.dev";
  }
  let sync: SyncStatus = { phase: settings["sync.enabled"] ? "online" : "disabled", serverUrl: settings["sync.serverUrl"] ?? undefined, lastSyncedAt: settings["sync.enabled"] ? now : undefined, deviceId: "mock-device", deviceName: settings["sync.deviceName"] ?? "This Mac", pendingChanges: 0, counts: SYNC_COUNTS, stopReason };
  let syncToken = "mock-sync-token";
  let mockVault = settings["sync.enabled"] || stopReason || syncParams.get("mock.sync.vault") === "present"
    ? { passphrase: "correct horse battery staple" } : undefined;
  let deviceRevoked = stopReason === "device-removed" || syncParams.get("mock.sync.vault") === "unknown";
  const syncCredentials = (serverUrl: string, token: string) => {
    let url: URL;
    try { url = new URL(serverUrl); } catch { return fail("Invalid sync server URL"); }
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) fail("Sync requires HTTPS (HTTP is allowed only for localhost development)");
    if (!token.length || token.length > 4096 || /[\r\n]/.test(token)) fail("A valid sync server token is required");
    return { serverUrl: url.toString().replace(/\/+$/, ""), token };
  };
  let devices = structuredClone(DEVICES);
  let scripts = structuredClone(SCRIPTS);

  // AI secret presence is device-local in the mock, just as it is in Keychain.
  const providerHeaderKeys = new Set(providers.flatMap((p) => (p.secretHeaders ?? Object.keys(p.headers ?? {})).map((name) => `${p.id}:${name}`)));
  const mcpKeys = new Set(mcp.flatMap((s) => ([ ["env", s.env], ["header", s.headers] ] as const).flatMap(([kind, values]) => Object.keys(values ?? {}).map((name) => `${s.id}:${kind}:${name}`))));
  const missingProviderHeaders = (p: ProviderRow) => (p.secretHeaders ?? []).filter((name) => !providerHeaderKeys.has(`${p.id}:${name}`));
  const missingMcpSecrets = (s: MCPServer) => ([ ["env", s.env], ["header", s.headers] ] as const).flatMap(([kind, values]) => Object.entries(values ?? {}).filter(([name, value]) => value === "$keychain" && !mcpKeys.has(`${s.id}:${kind}:${name}`)).map(([name]) => `${kind}:${name}`));

  const providerChanged = () => events.emit("ai.providers.changed", {});
  const entitiesChanged = (collection: string, ids: string[]) => events.emit("entities.changed", { collection, ids, source: "local" });
  const setSetting = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) => {
    settings[key] = value;
    events.emit("settings.changed", { key, value });
  };
  const emitSync = (next: SyncStatus) => {
    sync = next;
    events.emit("sync.status", sync);
    return sync;
  };
  const provider = (id: string) => providers.find((p) => p.id === id) ?? fail(`Provider ${id} not found`, RpcErrorCode.NotFound);
  const extension = (name: string) => extensions.find((e) => e.name === name) ?? fail(`Extension ${name} not found`, RpcErrorCode.NotFound);

  return {
    "commands.setPrefs": ({ id, prefs, unset }) => {
      const command = commands.find((c) => c.id === id) ?? fail(`Command ${id} not found`, RpcErrorCode.NotFound);
      if (prefs.alias !== undefined) command.alias = prefs.alias || undefined;
      if (prefs.hotkey !== undefined) command.hotkey = prefs.hotkey;
      if (prefs.enabled !== undefined) command.enabled = prefs.enabled;
      if (prefs.favoriteOrder !== undefined) command.favorite = true;
      for (const key of unset ?? []) {
        if (key === "alias") command.alias = undefined;
        if (key === "hotkey") command.hotkey = undefined;
        if (key === "favoriteOrder") command.favorite = false;
      }
      events.emit("commands.changed", { reason: "prefs" });
      return { ...command };
    },

    "ai.providers.templates": () => PROVIDER_TEMPLATES,
    "ai.providers.list": () => structuredClone(providers.map((p) => ({ ...p, missingSecretHeaders: missingProviderHeaders(p) }))),
    "ai.providers.detectLocal": async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (new URLSearchParams(location.search).get("mock.ai.detect") === "none") return [];
      return [
        { templateId: "ollama", baseUrl: "http://127.0.0.1:11434/v1", api: "openai", status: "ok", modelCount: DISCOVERABLE.ollama?.length ?? 0, sample: (DISCOVERABLE.ollama ?? []).slice(0, 5).map((m) => m.id), latencyMs: 24 },
        { templateId: "cliproxyapi", baseUrl: "http://127.0.0.1:8317/v1", api: "openai", status: "auth-required", modelCount: 0, sample: [], latencyMs: 18 },
      ];
    },
    "ai.providers.testDraft": async ({ provider: draft, apiKey, secretHeaders }) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const saved = draft.id ? provider(draft.id) : undefined;
      const template = PROVIDER_TEMPLATES.find((t) => t.id === draft.template);
      const keyPresent = apiKey === undefined ? saved?.hasApiKey : Boolean(apiKey);
      const missing = Object.entries(secretHeaders ?? {}).find(([name, value]) => value === "$keychain" && !providerHeaderKeys.has(`${draft.id}:${name}`));
      const message = !isHttpUrl(draft.baseUrl) ? "Enter a valid http:// or https:// URL" : draft.baseUrl.includes("/bad") ? "The server answered but has no model list there. Check that the URL ends with /v1." : missing ? `Configure the ${missing[0]} header on this Mac` : apiKey === "invalid" || ((template?.needsApiKey || draft.template === "cliproxyapi") && !keyPresent) ? "Provider HTTP 401: Check the API key." : undefined;
      const models = message ? [] : DISCOVERABLE[draft.template ?? "custom"] ?? [{ id: "default-model" }];
      return { ok: !message, message: message ?? `Connected and fetched ${models.length} model${models.length === 1 ? "" : "s"}`, latencyMs: 180, modelCount: models.length, sampleModelIds: models.slice(0, 5).map((m) => m.id) };
    },
    "ai.providers.upsert": ({ provider: input, apiKey }) => {
      if (!input.name.trim()) fail("Provider needs a name");
      if (!isHttpUrl(input.baseUrl)) fail("Base URL must be an http(s) URL without credentials");
      const existing = input.id ? providers.find((p) => p.id === input.id) : undefined;
      const hasApiKey = apiKey === undefined ? (existing?.hasApiKey ?? false) : Boolean(apiKey);
      const headers = input.headers ? Object.fromEntries(Object.keys(input.headers).map((name) => [name, "$keychain"])) : existing?.headers;
      const next: ProviderRow = {
        ...(existing ?? { id: newId("provider"), enabled: true, autoFetchModels: true, models: [], createdAt: Date.now() }),
        ...input,
        headers,
        secretHeaders: headers ? Object.keys(headers) : undefined,
        hasApiKey,
        models: input.models ?? existing?.models ?? [],
        updatedAt: Date.now(),
      } as ProviderRow;
      for (const [name, value] of Object.entries(input.headers ?? {})) if (value !== "$keychain") providerHeaderKeys.add(`${next.id}:${name}`);
      next.secretHeaders = input.secretHeaders ?? (input.headers ? Object.keys(input.headers) : existing?.secretHeaders);
      if (next.enabled && next.autoFetchModels && (!next.models.length || apiKey !== undefined || input.headers !== undefined || existing?.modelFetchError || existing?.api !== next.api || existing?.baseUrl !== next.baseUrl)) {
        next.models = structuredClone(DISCOVERABLE[next.template] ?? [{ id: "default-model", name: "default-model", capabilities: { tools: true }, enabled: true }]);
        next.modelFetchError = undefined;
      }
      if (existing) Object.assign(existing, next);
      else providers.push(next);
      providerChanged();
      return next;
    },
    "ai.providers.delete": ({ id }) => {
      const index = providers.findIndex((p) => p.id === id);
      if (index !== -1) providers.splice(index, 1);
      providerChanged();
    },
    "ai.providers.test": async ({ id, deep }) => {
      const p = provider(id);
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (p.modelFetchError) return { ok: false, message: p.modelFetchError };
      const template = PROVIDER_TEMPLATES.find((t) => t.id === p.template);
      if (template?.needsApiKey && !p.hasApiKey) return { ok: false, message: "401 Unauthorized — add an API key" };
      return { ok: true, message: deep ? `Models: OK (${p.models.length}). Chat: OK.` : `Connected · ${p.models.length} models`, latencyMs: 180 + Math.round(Math.random() * 200) };
    },
    "ai.providers.refreshModels": async ({ id }) => {
      const p = provider(id);
      await new Promise((resolve) => setTimeout(resolve, 500));
      for (const model of DISCOVERABLE[p.template] ?? []) if (!p.models.some((m) => m.id === model.id)) p.models.push(structuredClone(model));
      p.modelFetchError = undefined;
      p.updatedAt = Date.now();
      providerChanged();
      return p;
    },
    "ai.models.list": ({ includeDisabled }) =>
      providers
        .filter((p) => p.enabled)
        .flatMap((p) =>
          p.models
            .filter((m) => includeDisabled || m.enabled)
            .map((m) => ({ ref: `${p.id}/${m.id}`, providerId: p.id, providerName: p.name, modelId: m.id, name: m.name, capabilities: m.capabilities, contextWindow: m.contextWindow })),
        ),

    "ai.webSearch.hasApiKey": ({ provider: id }) => webSearchKeys.has(id),
    "ai.webSearch.setApiKey": ({ provider: id, apiKey }) => {
      if (apiKey) webSearchKeys.add(id);
      else webSearchKeys.delete(id);
    },
    "ai.tools.list": () => TOOLS,

    "ai.mcp.list": () => structuredClone(mcp.map((s) => ({ ...s, missingSecrets: missingMcpSecrets(s) }))),
    "ai.mcp.upsert": (input) => {
      const existing = input.id ? mcp.find((s) => s.id === input.id) : undefined;
      const server = {
        ...(existing ?? { id: newId("mcp"), createdAt: Date.now(), status: "disconnected" as const, toolCount: 0, enabled: true }),
        ...input,
        env: input.env ? Object.fromEntries(Object.keys(input.env).map((name) => [name, "$keychain"])) : existing?.env,
        headers: input.headers ? Object.fromEntries(Object.keys(input.headers).map((name) => [name, "$keychain"])) : existing?.headers,
        mentionName: input.mentionName ?? input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        updatedAt: Date.now(),
      };
      for (const [kind, values] of [ ["env", input.env], ["header", input.headers] ] as const)
        for (const [name, value] of Object.entries(values ?? {})) if (value !== "$keychain") mcpKeys.add(`${server.id}:${kind}:${name}`);
      if (existing) Object.assign(existing, server);
      else mcp.push(server);
      events.emit("ai.mcp.changed", {});
      return server;
    },
    "ai.mcp.delete": ({ id }) => {
      const index = mcp.findIndex((s) => s.id === id);
      if (index !== -1) mcp.splice(index, 1);
      events.emit("ai.mcp.changed", {});
    },
    "ai.mcp.test": async ({ id }) => {
      const server = mcp.find((s) => s.id === id) ?? fail(`Server ${id} not found`, RpcErrorCode.NotFound);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const missing = missingMcpSecrets(server);
      if (missing.length) return { ok: false, message: `Configure ${missing.join(", ")} on this Mac`, tools: [] };
      if (server.status === "error") return { ok: false, message: server.error ?? "Connection failed", tools: [] };
      server.status = "connected";
      server.toolCount = Math.max(server.toolCount, 3);
      events.emit("ai.mcp.changed", {});
      return { ok: true, message: `Connected · ${server.toolCount} tools`, tools: ["read_file", "write_file", "list_directory"].slice(0, server.toolCount) };
    },
    "ai.mcp.import": ({ json }) => {
      let parsed: { mcpServers?: Record<string, { command?: string; args?: string[]; url?: string; env?: Record<string, string>; headers?: Record<string, string> }> };
      try {
        parsed = JSON.parse(json);
      } catch {
        return fail("The text is not valid JSON");
      }
      if (!parsed || !parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)) fail("Expected a Claude Desktop-style mcpServers object");
      const entries = Object.entries(parsed.mcpServers ?? {});
      if (entries.some(([, config]) => !config || typeof config !== "object" || (!config.command && !config.url))) fail("Each server needs a command or URL");
      for (const [name, config] of entries) {
        mcp.push({
          id: newId("mcp"),
          name,
          mentionName: name,
          transport: config.url ? "http" : "stdio",
          command: config.command,
          args: config.args,
          url: config.url,
          env: config.env ? Object.fromEntries(Object.keys(config.env).map((key) => [key, "$keychain"])) : undefined,
          headers: config.headers ? Object.fromEntries(Object.keys(config.headers).map((key) => [key, "$keychain"])) : undefined,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "disconnected",
          toolCount: 0,
        });
      }
      for (const server of mcp.slice(-entries.length)) {
        const config = parsed.mcpServers?.[server.name];
        for (const [kind, values] of [ ["env", config?.env], ["header", config?.headers] ] as const)
          for (const [name, value] of Object.entries(values ?? {})) if (value !== "$keychain") mcpKeys.add(`${server.id}:${kind}:${name}`);
      }
      events.emit("ai.mcp.changed", {});
      return { imported: entries.length };
    },

    "ai.commands.list": () => structuredClone(aiCommands),
    "ai.commands.upsert": (input) => {
      const existing = input.id ? aiCommands.find((c) => c.id === input.id) : undefined;
      const command: AICommand = { creativity: "medium", output: "quick-ai", createdAt: Date.now(), ...existing, ...input, model: input.model === null ? undefined : input.model ?? existing?.model, reasoningEffort: input.reasoningEffort === null ? undefined : input.reasoningEffort ?? existing?.reasoningEffort, id: existing?.id ?? newId("command"), updatedAt: Date.now() };
      if (existing) Object.assign(existing, command);
      else aiCommands.push(command);
      entitiesChanged("aiCommands", [command.id]);
      return command;
    },
    "ai.commands.delete": ({ id }) => {
      const index = aiCommands.findIndex((c) => c.id === id);
      if (index !== -1) aiCommands.splice(index, 1);
      entitiesChanged("aiCommands", [id]);
    },
    "ai.commands.reset": ({ id }) => {
      const original = AI_COMMANDS.find((c) => c.id === id) ?? fail("Only built-in commands can be reset");
      const index = aiCommands.findIndex((c) => c.id === id);
      aiCommands[index] = structuredClone(original);
      entitiesChanged("aiCommands", [id]);
      return aiCommands[index];
    },
    "ai.commands.export": () => ({
      json: JSON.stringify(
        aiCommands.filter((c) => !c.builtin).map(({ name, prompt, creativity, model, icon, output, webSearch, reasoningEffort, highlightEdits, tags }) => ({ title: name, prompt, creativity, model, icon, output, webSearch, reasoningEffort, highlightEdits, tags })),
        null,
        2,
      ),
    }),
    "ai.commands.import": ({ json }) => {
      let items: (Partial<AICommand> & { title?: string })[];
      try {
        items = JSON.parse(json);
      } catch {
        return fail("The text is not valid JSON");
      }
      if (!Array.isArray(items)) fail("Expected an array of AI commands");
      if (items.some((item) => !item || typeof item !== "object" || typeof (item.title ?? item.name) !== "string" || !(item.title ?? item.name)?.trim() || typeof item.prompt !== "string" || !item.prompt.trim())) fail("Each command needs a name and prompt");
      const valid = items;
      for (const item of valid)
        aiCommands.push({
          id: newId("command"),
          name: item.title ?? item.name ?? "",
          prompt: item.prompt ?? "",
          icon: item.icon,
          model: item.model,
          creativity: item.creativity ?? "medium",
          output: item.output ?? "quick-ai",
          reasoningEffort: item.reasoningEffort,
          webSearch: item.webSearch,
          highlightEdits: item.highlightEdits,
          tags: item.tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      entitiesChanged("aiCommands", []);
      return { imported: valid.length };
    },
    "ai.presets.list": () => structuredClone(presets),
    "ai.presets.upsert": (input) => {
      const existing = input.id ? presets.find((p) => p.id === input.id) : undefined;
      const preset: AIPreset = {
        instructions: "",
        creativity: "medium",
        webSearch: false,
        tools: [],
        createdAt: Date.now(),
        ...existing,
        ...input,
        model: input.model === null ? undefined : input.model ?? existing?.model,
        reasoningEffort: input.reasoningEffort === null ? undefined : input.reasoningEffort ?? existing?.reasoningEffort,
        id: existing?.id ?? newId("preset"),
        updatedAt: Date.now(),
      };
      if (existing) Object.assign(existing, preset);
      else presets.push(preset);
      entitiesChanged("aiPresets", [preset.id]);
      return preset;
    },
    "ai.presets.delete": ({ id }) => {
      const index = presets.findIndex((p) => p.id === id);
      if (index !== -1) presets.splice(index, 1);
      entitiesChanged("aiPresets", [id]);
    },
    "ai.presets.reset": ({ id }) => {
      const original = AI_PRESETS.find((preset) => preset.id === id && preset.builtin) ?? fail("Only built-in agents can be reset");
      const index = presets.findIndex((preset) => preset.id === id);
      if (index < 0) return fail("Agent not found", RpcErrorCode.NotFound);
      const restored = { ...structuredClone(original), updatedAt: Date.now() };
      presets[index] = restored;
      entitiesChanged("aiPresets", [id]);
      return restored;
    },

    "themes.list": () => themes,

    "extensions.list": () => extensions,
    "extensions.setEnabled": ({ name, enabled }) => {
      extension(name).enabled = enabled;
      for (const command of commands) if (command.extensionId === name) command.enabled = enabled;
      events.emit("extensions.changed", {});
      events.emit("commands.changed", { reason: "extension" });
    },
    "extensions.uninstall": ({ name }) => {
      const index = extensions.findIndex((e) => e.name === name);
      if (index !== -1) extensions.splice(index, 1);
      for (let i = commands.length - 1; i >= 0; i--) if (commands[i].extensionId === name) commands.splice(i, 1);
      events.emit("extensions.changed", {});
      events.emit("commands.changed", { reason: "uninstall" });
    },
    "extensions.install": (params) => {
      if (params.source !== "local") return fail("The mock backend installs only local extensions");
      const name = params.path.split("/").filter(Boolean).pop() ?? "extension";
      const installed: InstalledExtension = {
        name,
        title: name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        author: "me",
        source: "local",
        path: params.path,
        enabled: true,
        installedAt: Date.now(),
        updatedAt: Date.now(),
        commands: [{ name: "index", title: "Open", mode: "view" }],
        tools: [],
        preferences: [],
      };
      extensions.push(installed);
      commands.push({
        id: `ext:${name}.index`,
        kind: "extension",
        title: "Open",
        subtitle: installed.title,
        typeLabel: "Command",
        icon: "app-window-16",
        mode: "view",
        enabled: true,
        extensionId: name,
        extensionTitle: installed.title,
      });
      events.emit("extensions.changed", {});
      events.emit("commands.changed", { reason: "install" });
      return installed;
    },
    "extensions.update": () => ({ updated: [] }),
    "extensions.develop": ({ path }) => {
      const name = path.split("/").filter(Boolean).pop() || fail("Choose an extension folder");
      const existing = extensions.find((item) => item.name === name);
      const developed: InstalledExtension = existing ?? { name, title: name, author: "me", enabled: true, source: "development", path, commands: [{ name: "index", title: "Open", mode: "view" }], preferences: [], tools: [], installedAt: Date.now(), updatedAt: Date.now() };
      developed.source = "development";
      developed.path = path;
      if (!existing) {
        extensions.push(developed);
        commands.push({ id: `ext:${name}.index`, title: "Open", kind: "extension", typeLabel: "Command", icon: "terminal-16", mode: "view", enabled: true, extensionId: name, extensionTitle: developed.title });
      }
      events.emit("extensions.changed", {});
      events.emit("commands.changed", { reason: "develop" });
      return developed;
    },
    "extensions.getPreferences": ({ name, command }) => {
      const ext = extension(name);
      const defs = command ? (ext.commands.find((c) => c.name === command)?.preferences ?? []) : ext.preferences;
      const stored = extensionPrefs.get(`${name}/${command ?? ""}`) ?? {};
      const values = Object.fromEntries(defs.map((d) => [d.name, stored[d.name] ?? d.default]));
      for (const definition of defs) if (definition.type === "password" && values[definition.name]) values[definition.name] = "$keychain";
      return { values, missingRequired: defs.filter((d) => d.required && (values[d.name] === undefined || values[d.name] === "")).map((d) => d.name) };
    },
    "extensions.setPreferences": ({ name, command, values }) => {
      const key = `${name}/${command ?? ""}`;
      const installed = extension(name);
      const defs = command ? installed.commands.find((c) => c.name === command)?.preferences ?? [] : installed.preferences;
      const redacted = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, defs.some((definition) => definition.name === key && definition.type === "password") && value ? "$keychain" : value]));
      extensionPrefs.set(key, { ...extensionPrefs.get(key), ...redacted });
      events.emit("extensions.changed", {});
    },

    "scripts.list": () => scripts,
    "scripts.create": ({ directory, title, mode, language, packageName }) => {
      if (!settings["scripts.directories"].includes(directory)) fail("Choose a registered script folder");
      if (!title.trim()) fail("Give the script a title");
      const extensions: Record<string, string> = { bash: "sh", python: "py", node: "js", applescript: "applescript", swift: "swift", ruby: "rb" };
      const suffix = extensions[language] ?? fail("Unsupported script language");
      const filename = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "script";
      const path = `${directory.replace(/\/$/, "")}/${filename}.${suffix}`;
      if (scripts.some((script) => script.path === path)) fail("A script with this filename already exists");
      const script: ScriptCommand = { path, title: title.trim(), mode, language, packageName, arguments: [] };
      scripts.push(script);
      commands.push({ id: `script:${path}`, title: script.title, subtitle: packageName, kind: "script", typeLabel: "Script Command", mode: mode === "silent" ? "no-view" : "view", icon: "terminal-16", enabled: true });
      events.emit("commands.changed", { reason: "scripts" });
      return script;
    },
    "scripts.directories.add": ({ path }) => {
      if (!settings["scripts.directories"].includes(path)) setSetting("scripts.directories", [...settings["scripts.directories"], path]);
      events.emit("commands.changed", { reason: "scripts" });
    },
    "scripts.directories.remove": ({ path }) => {
      setSetting(
        "scripts.directories",
        settings["scripts.directories"].filter((d) => d !== path),
      );
      const prefix = `${path.replace(/\/$/, "")}/`;
      scripts = scripts.filter((s) => !s.path.startsWith(prefix));
      events.emit("commands.changed", { reason: "scripts" });
    },

    "sync.status": () => sync,
    "sync.probe": ({ serverUrl, token }) => {
      syncCredentials(serverUrl, token);
      if (token === "incorrect") fail("Invalid sync server token");
      return { vault: deviceRevoked ? "unknown" : mockVault ? "present" : "absent", deviceRevoked, configured: true };
    },
    "sync.setupCode": () => {
      if (!settings["sync.enabled"] || !sync.serverUrl) return fail("Cloud Sync is disconnected");
      const bytes = new TextEncoder().encode(JSON.stringify({ url: sync.serverUrl, token: syncToken }));
      const encoded = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      return { code: "opencast-sync-v1:" + encoded, serverUrl: sync.serverUrl };
    },
    "sync.parseSetupCode": ({ code }) => {
      const prefix = "opencast-sync-v1:";
      const invalid = "Invalid setup code. Copy it again from your other Mac or the deploy script.";
      if (!code.trim().startsWith(prefix)) return fail(invalid);
      const encoded = code.trim().slice(prefix.length);
      if (encoded.length > Math.ceil(8192 * 4 / 3)) return fail("Setup code exceeds 8 KiB");
      if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return fail(invalid);
      let value: unknown;
      try {
        const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
        if (binary.length > 8192) return fail("Setup code exceeds 8 KiB");
        if (btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") !== encoded) return fail(invalid);
        value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0))));
      } catch { return fail(invalid); }
      if (!value || typeof value !== "object" || Array.isArray(value)) return fail(invalid);
      const payload = value as Record<string, unknown>;
      if (typeof payload.url !== "string" || typeof payload.token !== "string") return fail(invalid);
      return syncCredentials(payload.url, payload.token);
    },
    "sync.connect": async ({ serverUrl, token, passphrase, deviceName, expectVault }) => {
      const credentials = syncCredentials(serverUrl, token);
      if (token === "incorrect") fail("Invalid sync server token");
      if (expectVault === "create" && mockVault) fail("A vault already exists for that token. Join it instead.");
      if (expectVault === "join" && !mockVault) fail("No vault exists for that token. Check the server URL and token.");
      if (!passphrase || passphrase.length > 4096) fail("Passphrase must contain 1–4096 characters");
      if (!mockVault && passphrase.length < 12) fail("Use at least 12 characters for a new vault passphrase");
      if (mockVault && passphrase !== mockVault.passphrase) fail("Wrong passphrase");
      emitSync({ ...sync, phase: "connecting", serverUrl: credentials.serverUrl });
      await new Promise((resolve) => setTimeout(resolve, 700));
      mockVault ??= { passphrase };
      deviceRevoked = false;
      syncToken = token;
      setSetting("sync.serverUrl", credentials.serverUrl);
      if (deviceName) setSetting("sync.deviceName", deviceName);
      devices = devices.map((d) => (d.current ? { ...d, name: deviceName || d.name } : d));
      const status = emitSync({ ...sync, phase: "online", serverUrl: credentials.serverUrl, deviceName: deviceName || sync.deviceName, lastSyncedAt: Date.now(), pendingChanges: 0, stopReason: undefined });
      setSetting("sync.enabled", true);
      return status;
    },
    "sync.updateToken": ({ token }) => {
      if (!settings["sync.enabled"] || !sync.serverUrl) return fail("Cloud Sync is disconnected");
      syncCredentials(sync.serverUrl, token);
      if (token === "incorrect") return fail("Invalid sync server token");
      syncToken = token;
      return sync;
    },
    "sync.changePassphrase": ({ newPassphrase }) => {
      if (!settings["sync.enabled"] || !mockVault) return fail("Cloud Sync is disconnected");
      if (newPassphrase.length < 12 || newPassphrase.length > 4096) return fail("Passphrase must contain 12–4096 characters");
      mockVault.passphrase = newPassphrase;
    },
    "sync.disconnect": () => {
      setSetting("sync.enabled", false);
      emitSync({ ...sync, phase: "disabled", lastSyncedAt: undefined, stopReason: undefined });
    },
    "sync.now": async () => {
      if (!settings["sync.enabled"]) return sync;
      emitSync({ ...sync, phase: "initial-sync" });
      await new Promise((resolve) => setTimeout(resolve, 600));
      return emitSync({ ...sync, phase: "online", lastSyncedAt: Date.now(), pendingChanges: 0 });
    },
    "sync.devices": () => (settings["sync.enabled"] ? devices : []),
    "sync.removeDevice": ({ deviceId }) => {
      devices = devices.filter((d) => d.deviceId !== deviceId);
      events.emit("sync.status", sync);
    },
    "sync.setCategoryEnabled": ({ category, enabled }) => {
      const known = SYNC_CATEGORIES.find((c) => c.id === category);
      if (!known) fail(`Unknown sync category ${category}`);
      const key = known && "optIn" in known ? "sync.optInCategories" : "sync.disabledCategories";
      const ids = new Set(settings[key]);
      if (enabled === (key === "sync.optInCategories")) ids.add(category);
      else ids.delete(category);
      setSetting(key, [...ids]);
    },
    "sync.wipeRemote": () => {
      setSetting("sync.enabled", false);
      mockVault = undefined;
      devices = structuredClone(DEVICES);
      emitSync({ ...sync, phase: "disabled", lastSyncedAt: undefined, stopReason: undefined });
    },

    "data.importRayconfig": async ({ path, password, categories }) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      if (!path.endsWith(".rayconfig")) fail("Choose a Raycast export (.rayconfig)");
      if (password !== undefined && password.length < 8) fail("Wrong password for this export");
      const all = ["settings", "snippets", "quicklinks", "notes", "themes", "ai"];
      return {
        results: all
          .filter((c) => !categories || categories.includes(c))
          .map((category) =>
            category === "themes"
              ? { category, imported: 0, error: "No custom themes in this export" }
              : { category, imported: { settings: 14, snippets: 23, quicklinks: 8, notes: 5, ai: 6 }[category] ?? 0 },
          ),
      };
    },
    "data.export": async ({ path }) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      return { path };
    },
    "data.import": async () => ({
      results: [
        { category: "settings", imported: 31 },
        { category: "snippets", imported: 3 },
      ],
    }),
    "data.storage": () => ({
      totalBytes: 48_213_504,
      databaseBytes: 12_582_912,
      clipboardBytes: 35_630_592,
      entities: { notes: 2, snippets: 3, quicklinks: 2, aiChats: 2, aiMessages: 4 },
      clipboardItems: 6,
    }),
    "data.backup.hasPassphrase": () => backupHasPassphrase,
    "data.backup.setPassphrase": ({ passphrase }) => {
      if (passphrase !== null && passphrase.length < 8) fail("Use at least 8 characters");
      backupHasPassphrase = Boolean(passphrase);
    },
  };
}
