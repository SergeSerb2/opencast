import type { AIModelOption, AIPreset, AIToolInfo, BackendParams, Creativity } from "@surgecast/protocol";
import type { MetadataEntry } from "../../../components/Detail/Metadata";
import { fuzzyFilter, type MatchRange } from "../../../lib/fuzzy";
import { creativityLabel, DEFAULT_AI_ICON, formatTimestamp, modelLabel, reasoningLabel, type ReasoningEffort } from "../ai-shared/options";

export type PresetEditorMode = "create" | "edit" | "duplicate";

/** The web toolset is shown as the "Search the web" option rather than in the tool list. */
export const WEB_TOOLSET = "web";

/** Editor state for a preset; "" means "use the default" for icon, model and reasoning effort. */
export interface PresetDraft {
  name: string;
  icon: string;
  description: string;
  instructions: string;
  model: string;
  creativity: Creativity;
  reasoningEffort: ReasoningEffort | "";
  webSearch: boolean;
  tools: string[];
}

export type PresetDraftErrors = Partial<Record<"name", string>>;

export function emptyPresetDraft(): PresetDraft {
  return { name: "", icon: "", description: "", instructions: "", model: "", creativity: "medium", reasoningEffort: "", webSearch: false, tools: [] };
}

export function presetDraft(preset: AIPreset | undefined, mode: PresetEditorMode): PresetDraft {
  if (!preset) return emptyPresetDraft();
  return {
    name: mode === "duplicate" ? `${preset.name} Copy` : preset.name,
    icon: typeof preset.icon === "string" ? preset.icon : "",
    description: preset.description ?? "",
    instructions: preset.instructions,
    model: preset.model ?? "",
    creativity: preset.creativity,
    reasoningEffort: preset.reasoningEffort ?? "",
    webSearch: preset.webSearch || preset.tools.includes(WEB_TOOLSET),
    tools: preset.tools.filter((t) => t !== WEB_TOOLSET),
  };
}

export function validatePresetDraft(draft: PresetDraft): PresetDraftErrors {
  return draft.name.trim() ? {} : { name: "Enter a name" };
}

/** `ai.presets.upsert` params; a cleared icon is sent as the default tile because missing fields keep their old value. */
export function presetUpsertParams(draft: PresetDraft, existing?: AIPreset): BackendParams<"ai.presets.upsert"> {
  const clearedIcon = !draft.icon && existing?.icon !== undefined;
  return {
    ...(existing ? { id: existing.id } : {}),
    name: draft.name.trim(),
    icon: draft.icon || (clearedIcon ? DEFAULT_AI_ICON : undefined),
    description: draft.description.trim(),
    instructions: draft.instructions,
    model: draft.model || null,
    creativity: draft.creativity,
    reasoningEffort: draft.reasoningEffort || null,
    webSearch: draft.webSearch,
    tools: draft.tools.filter((t) => t !== WEB_TOOLSET),
  };
}

export interface ToolsetOption {
  value: string;
  title: string;
  icon?: AIToolInfo["icon"];
  toolCount: number;
}

const TOOLSET_ORDER = (toolset: string) => (toolset === "builtin" ? 0 : toolset.startsWith("ext:") ? 1 : toolset.startsWith("mcp:") ? 2 : 3);

/** One option per toolset (presets enable whole toolsets), built-in first, then extensions, then MCP servers. */
export function toolsetOptions(tools: AIToolInfo[]): ToolsetOption[] {
  const byToolset = new Map<string, ToolsetOption>();
  for (const tool of tools) {
    if (tool.toolset === WEB_TOOLSET) continue;
    const option = byToolset.get(tool.toolset) ?? { value: tool.toolset, title: tool.toolsetTitle, icon: tool.icon, toolCount: 0 };
    option.toolCount += 1;
    byToolset.set(tool.toolset, option);
  }
  return [...byToolset.values()].sort((a, b) => TOOLSET_ORDER(a.value) - TOOLSET_ORDER(b.value) || a.title.localeCompare(b.title));
}

/** Readable names for a preset's toolsets; ones that are no longer available keep their id. */
export function toolsetTitles(ids: string[], tools: AIToolInfo[] | undefined): string[] {
  return ids.filter((id) => id !== WEB_TOOLSET).map((id) => tools?.find((t) => t.toolset === id)?.toolsetTitle ?? `${id.replace(/^(ext|mcp):/, "")} (Unavailable)`);
}

export interface PresetSection {
  id: "custom" | "builtin";
  title: string;
  items: { preset: AIPreset; ranges: MatchRange[] }[];
}

const byName = (a: AIPreset, b: AIPreset) => a.name.localeCompare(b.name);

/** "Custom Presets" then "Built-in Presets", fuzzy-filtered by name and description. */
export function presetSections(presets: AIPreset[], query: string): PresetSection[] {
  const section = (id: PresetSection["id"], title: string, items: AIPreset[]): PresetSection => ({
    id,
    title,
    items: fuzzyFilter([...items].sort(byName), query, (p) => [{ text: p.name, highlight: true }, { text: p.description, weight: 0.6 }]).map((hit) => ({ preset: hit.item, ranges: hit.ranges })),
  });
  return [section("custom", "Custom Presets", presets.filter((p) => !p.builtin)), section("builtin", "Built-in Presets", presets.filter((p) => p.builtin))].filter((s) => s.items.length > 0);
}

/** Information rows of the preset detail pane. */
export function presetMetadata(preset: AIPreset, models: AIModelOption[] | undefined, chatModel: string | null | undefined, tools: AIToolInfo[] | undefined): MetadataEntry[] {
  const entries: MetadataEntry[] = [
    { kind: "label", title: "Name", text: preset.name },
    { kind: "label", title: "Type", text: preset.builtin ? "Built-in" : "Custom" },
    { kind: "label", title: "Model", text: modelLabel(preset.model, models, chatModel) },
    { kind: "label", title: "Creativity", text: creativityLabel(preset.creativity) },
  ];
  const reasoning = reasoningLabel(preset.reasoningEffort);
  if (reasoning) entries.push({ kind: "label", title: "Reasoning Effort", text: reasoning });
  entries.push({ kind: "label", title: "Web Search", text: preset.webSearch || preset.tools.includes(WEB_TOOLSET) ? "On" : "Off" });
  const toolTitles = toolsetTitles(preset.tools, tools);
  if (toolTitles.length) entries.push({ kind: "tags", title: "Tools", tags: toolTitles.map((text) => ({ text })) });
  entries.push({ kind: "label", title: "Created", text: formatTimestamp(preset.createdAt) });
  if (preset.updatedAt !== preset.createdAt) entries.push({ kind: "label", title: "Modified", text: formatTimestamp(preset.updatedAt) });
  return entries;
}
