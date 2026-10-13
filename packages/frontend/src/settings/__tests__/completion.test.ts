import { describe, expect, it, vi } from "vitest";
import { defaultSettings, type AIPreset, type BackendEvents } from "@opencast/protocol";
import { Emitter } from "../../bridge/emitter";
import { settingsMockHandlers } from "../../bridge/mock/settings-handlers";
import { draftFromTemplate, reconcileProviderDraft, type ProviderTemplate } from "../pages/ai/provider-form";
import { exportPresets, parsePresetImport } from "../pages/ai/preset-json";
import { parseEnv, parseHeaders, validateClaudeImport } from "../pages/ai/mcp-form";
import { promptProblem } from "../pages/ai/editors";

const agent: AIPreset = { id: "original-id", name: "Research", instructions: "Investigate the question", creativity: "low", reasoningEffort: "high", webSearch: true, tools: ["web"], builtin: true, createdAt: 1, updatedAt: 2 };

describe("agent portability", () => {
  it("round-trips the full definition without identity or built-in privileges", () => {
    const [imported] = parsePresetImport(exportPresets([agent]));
    expect(imported).toMatchObject({ name: "Research", instructions: agent.instructions, reasoningEffort: "high", tools: ["web"], webSearch: true });
    expect(imported).not.toHaveProperty("id");
    expect(imported).not.toHaveProperty("builtin");
  });
  it("accepts a presets container and legacy titles", () => {
    expect(parsePresetImport('{"presets":[{"title":" Legacy "}]}')[0]).toMatchObject({ name: "Legacy", instructions: "", tools: [], creativity: "medium" });
  });
  it.each(["null", "[]", '{}', '[null]', '[{"name":""}]', '[{"name":"a","tools":"web"}]', '[{"name":"a","webSearch":"yes"}]', '[{"name":"a","creativity":"unknown"}]', '[{"name":"a","instructions":3}]', '[{"name":"a","reasoningEffort":"invalid"}]'])("rejects malformed import %s before writing any agent", (json) => {
    expect(() => parsePresetImport(json)).toThrow();
  });
});

describe("AI command prompts", () => {
  it("allows code and nested JSON alongside selection placeholders", () => {
    expect(promptProblem('Reply with {"result":{"summary":"text"}} for {selection}')).toBeNull();
    expect(promptProblem("  ")).toBe("Write the prompt");
  });
});

describe("MCP import and credential parsing", () => {
  it("rejects null or malformed servers and insecure remote URLs", () => {
    for (const json of ['null', '{"mcpServers":null}', '{"mcpServers":[]}', '{"mcpServers":{}}', '{"mcpServers":{"a":null}}', '{"mcpServers":{"a":{"url":"http://example.com"}}}', '{"mcpServers":{"a":{"command":"node","args":[3]}}}']) expect(validateClaudeImport(json)).not.toBeNull();
    expect(validateClaudeImport('{"mcpServers":{"files":{"command":"npx","args":["server"],"env":{"TOKEN":"secret"}}}}')).toBeNull();
  });
  it("rejects duplicate names and handles prototype-looking names safely", () => {
    expect(parseEnv("TOKEN=a\nTOKEN=b")).toHaveProperty("error");
    expect(parseHeaders("Authorization: a\nauthorization: b")).toHaveProperty("error");
    const parsed = parseEnv("__proto__=value");
    expect("values" in parsed && Object.hasOwn(parsed.values, "__proto__")).toBe(true);
    expect("values" in parsed && parsed.values["__proto__"]).toBe("value");
    expect(parseEnv("bad name=private-value")).toEqual({ error: "Each environment variable must be KEY=value" });
  });
});

describe("provider event reconciliation", () => {
  const template: ProviderTemplate = { id: "custom", name: "Local", api: "openai", baseUrl: "http://localhost:8317/v1", needsApiKey: false };
  const previous = draftFromTemplate(template);
  it("updates clean fields while keeping an unsaved name and secret", () => {
    const current = { ...previous, name: "My Local", apiKey: "secret" };
    const next = { ...previous, enabled: false, baseUrl: "http://localhost:1234/v1" };
    expect(reconcileProviderDraft(current, previous, next)).toMatchObject({ name: "My Local", apiKey: "secret", enabled: false, baseUrl: next.baseUrl });
  });
  it("replaces the draft when switching provider identities", () => {
    const next = { ...previous, id: "other" };
    expect(reconcileProviderDraft({ ...previous, name: "unsaved" }, previous, next)).toBe(next);
  });
});

describe("settings mock contracts", () => {
  it("round-trips command output and reasoning options through import/export", async () => {
    const handlers = settingsMockHandlers({ settings: defaultSettings(), commands: [], events: new Emitter<BackendEvents>() });
    await handlers["ai.commands.upsert"]!({ name: "Portable", prompt: "Summarize {selection}", output: "replace", creativity: "low", reasoningEffort: "high", webSearch: true, highlightEdits: true });
    const { json } = await handlers["ai.commands.export"]!(undefined);
    await handlers["ai.commands.import"]!({ json });
    const commands = await handlers["ai.commands.list"]!(undefined);
    const imported = commands.filter((command) => command.name === "Portable");
    expect(imported).toHaveLength(2);
    expect(imported[1]).toMatchObject({ output: "replace", reasoningEffort: "high", highlightEdits: true, webSearch: true, creativity: "low" });
  });
  it("emits agent reset events and preserves unique identities for rapid imports", async () => {
    const events = new Emitter<BackendEvents>();
    const listener = vi.fn();
    events.on("entities.changed", listener);
    const handlers = settingsMockHandlers({ settings: defaultSettings(), commands: [], events });
    const first = await handlers["ai.presets.upsert"]!({ name: "First" });
    const second = await handlers["ai.presets.upsert"]!({ name: "Second" });
    expect(first.id).not.toBe(second.id);
    await handlers["ai.presets.upsert"]!({ id: "preset-research", name: "Changed", instructions: "custom" });
    const reset = await handlers["ai.presets.reset"]!({ id: "preset-research" });
    expect(reset.name).toBe("Deep Research");
    expect(reset.instructions).not.toBe("custom");
    expect(listener).toHaveBeenLastCalledWith({ collection: "aiPresets", ids: [reset.id], source: "local" });
  });
  it("never returns typed MCP credential values", async () => {
    const handlers = settingsMockHandlers({ settings: defaultSettings(), commands: [], events: new Emitter<BackendEvents>() });
    await handlers["ai.mcp.upsert"]!({ name: "Secret server", transport: "stdio", command: "node", env: { TOKEN: "private-value" } });
    const servers = await handlers["ai.mcp.list"]!(undefined);
    expect(servers.find((server) => server.name === "Secret server")?.env).toEqual({ TOKEN: "$keychain" });
    expect(JSON.stringify(servers)).not.toContain("private-value");
  });
});
