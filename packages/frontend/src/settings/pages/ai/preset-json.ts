import type { AIPreset, BackendParams, Creativity } from "@opencast/protocol";

type PresetInput = BackendParams<"ai.presets.upsert">;
const CREATIVITY = new Set<Creativity>(["none", "low", "medium", "high", "maximum"]);
const EFFORT = new Set(["none", "low", "medium", "high"]);

/** Import definitions, never their IDs or built-in status, so existing agents are preserved. */
export function parsePresetImport(json: string): PresetInput[] {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("Enter valid JSON"); }
  const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>).presets : null;
  if (!Array.isArray(items) || !items.length) throw new Error("Expected a nonempty array of agents, or an object with a presets array");
  return items.map((item: unknown, index) => {
    const invalid = (message: string): never => { throw new Error(`Agent ${index + 1}: ${message}`); };
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid("expected an object");
    const row = item as Record<string, unknown>;
    const name = row.name ?? row.title;
    if (typeof name !== "string" || !name.trim()) return invalid("name is required");
    if (row.instructions !== undefined && typeof row.instructions !== "string") return invalid("instructions must be text");
    if (row.creativity !== undefined && !CREATIVITY.has(row.creativity as Creativity)) return invalid("unknown creativity level");
    if (row.reasoningEffort !== undefined && !EFFORT.has(String(row.reasoningEffort))) return invalid("unknown reasoning effort");
    if (row.tools !== undefined && (!Array.isArray(row.tools) || !row.tools.every((t) => typeof t === "string"))) return invalid("tools must be a list of names");
    if (row.webSearch !== undefined && typeof row.webSearch !== "boolean") return invalid("webSearch must be true or false");
    if (row.model !== undefined && typeof row.model !== "string") return invalid("model must be a model reference");
    return {
      name: name.trim(),
      instructions: typeof row.instructions === "string" ? row.instructions : "",
      description: typeof row.description === "string" ? row.description : undefined,
      icon: typeof row.icon === "string" ? row.icon : undefined,
      model: typeof row.model === "string" ? row.model : undefined,
      creativity: (row.creativity as Creativity | undefined) ?? "medium",
      reasoningEffort: row.reasoningEffort as AIPreset["reasoningEffort"],
      webSearch: row.webSearch === true,
      tools: (row.tools as string[] | undefined) ?? [],
    };
  });
}

export function exportPresets(presets: readonly AIPreset[]): string {
  return JSON.stringify(presets.map(({ name, description, icon, instructions, model, creativity, reasoningEffort, webSearch, tools }) => ({ name, description, icon, instructions, model, creativity, reasoningEffort, webSearch, tools })), null, 2);
}
