import { describe, expect, it } from "vitest";
import type { AIModelOption, AIPreset, AIToolInfo } from "@opencast/protocol";
import { DEFAULT_AI_ICON } from "../ai-shared/options";
import { emptyPresetDraft, presetDraft, presetMetadata, presetSections, presetUpsertParams, toolsetOptions, toolsetTitles, validatePresetDraft } from "./preset-form";

const preset = (patch: Partial<AIPreset>): AIPreset => ({ id: "p1", name: "Travel Planner", instructions: "Plan trips.", creativity: "medium", webSearch: false, tools: [], createdAt: 1, updatedAt: 1, ...patch });
const tool = (toolset: string, toolsetTitle: string, name: string): AIToolInfo => ({ name, title: name, description: "", toolset, toolsetTitle, inputSchema: {} });
const TOOLS = [tool("mcp:maps", "Maps", "mcp:maps.search"), tool("web", "Web", "web.search"), tool("builtin", "System", "clipboard.read"), tool("builtin", "System", "datetime.now"), tool("ext:github", "GitHub", "ext:github.search")];

describe("preset drafts", () => {
  it("turns the web toolset into the web search option", () => {
    const draft = presetDraft(preset({ tools: ["web", "builtin"], webSearch: false, icon: "airplane-16", model: "openai/gpt-5.1" }), "edit");
    expect(draft).toMatchObject({ webSearch: true, tools: ["builtin"], icon: "airplane-16", model: "openai/gpt-5.1" });
    expect(presetDraft(preset({}), "duplicate").name).toBe("Travel Planner Copy");
  });

  it("requires a name", () => {
    expect(validatePresetDraft(emptyPresetDraft())).toEqual({ name: "Enter a name" });
    expect(validatePresetDraft({ ...emptyPresetDraft(), name: "Helper" })).toEqual({});
  });

  it("sends explicit clears for default overrides through JSON", () => {
    const existing = preset({ model: "local/mock", reasoningEffort: "high" });
    const params = presetUpsertParams({ ...presetDraft(existing, "edit"), model: "", reasoningEffort: "" }, existing);
    expect(JSON.parse(JSON.stringify(params))).toMatchObject({ id: existing.id, model: null, reasoningEffort: null });
  });

  it("builds upsert params", () => {
    expect(presetUpsertParams({ ...emptyPresetDraft(), name: " Helper ", description: " Short ", tools: ["builtin", "web"], webSearch: true, reasoningEffort: "high" })).toEqual({
      name: "Helper",
      icon: undefined,
      description: "Short",
      instructions: "",
      model: null,
      creativity: "medium",
      reasoningEffort: "high",
      webSearch: true,
      tools: ["builtin"],
    });
    const existing = preset({ icon: "airplane-16" });
    expect(presetUpsertParams({ ...presetDraft(existing, "edit"), icon: "" }, existing)).toMatchObject({ id: "p1", icon: DEFAULT_AI_ICON });
  });
});

describe("toolsets", () => {
  it("lists toolsets once with tool counts, without the web toolset", () => {
    expect(toolsetOptions(TOOLS).map((o) => [o.value, o.title, o.toolCount])).toEqual([
      ["builtin", "System", 2],
      ["ext:github", "GitHub", 1],
      ["mcp:maps", "Maps", 1],
    ]);
  });

  it("names toolsets, marking unavailable ones", () => {
    expect(toolsetTitles(["web", "builtin", "mcp:linear"], TOOLS)).toEqual(["System", "linear (Unavailable)"]);
  });
});

describe("presetSections", () => {
  it("groups custom before built-in presets and filters", () => {
    const presets = [preset({ id: "b", name: "Deep Research", builtin: true }), preset({ id: "c", name: "SQL Helper", description: "Queries" }), preset({ id: "a", name: "Product Copywriter" })];
    expect(presetSections(presets, "").map((s) => [s.title, s.items.map((i) => i.preset.id)])).toEqual([
      ["Custom Presets", ["a", "c"]],
      ["Built-in Presets", ["b"]],
    ]);
    expect(presetSections(presets, "queries").flatMap((s) => s.items.map((i) => i.preset.id))).toEqual(["c"]);
  });
});

describe("presetMetadata", () => {
  const models: AIModelOption[] = [{ ref: "openai/gpt-5.1", providerId: "openai", providerName: "OpenAI", modelId: "gpt-5.1", name: "GPT-5.1", capabilities: {} }];

  it("describes model, web search and tools", () => {
    const entries = presetMetadata(preset({ tools: ["web", "builtin"], reasoningEffort: "low", updatedAt: 2 }), models, null, TOOLS);
    expect(entries.map((e) => (e.kind === "label" ? [e.title, e.text] : e.kind === "tags" ? [e.title, e.tags.map((t) => t.text)] : [e.kind]))).toEqual([
      ["Name", "Travel Planner"],
      ["Type", "Custom"],
      ["Model", "Default (GPT-5.1)"],
      ["Creativity", "Medium"],
      ["Reasoning Effort", "Low"],
      ["Web Search", "On"],
      ["Tools", ["System"]],
      ["Created", expect.any(String)],
      ["Modified", expect.any(String)],
    ]);
  });
});
