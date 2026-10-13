import type { AICommandOutput, AIModelOption, Creativity, NamedColor, TileImage } from "@opencast/protocol";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface Option<T extends string> {
  value: T;
  title: string;
  icon: string;
}

/** Same icon and colors the backend uses for AI commands and presets without an icon. */
export const DEFAULT_AI_ICON: TileImage = { tile: { glyph: "stars-16", background: ["#A45BFF", "#6B4CF6"], foreground: "#FFFFFF" } };

export const CREATIVITY_OPTIONS: Option<Creativity>[] = [
  { value: "none", title: "None", icon: "circle-disabled-16" },
  { value: "low", title: "Low", icon: "stacked-bars-1-16" },
  { value: "medium", title: "Medium", icon: "stacked-bars-2-16" },
  { value: "high", title: "High", icon: "stacked-bars-3-16" },
  { value: "maximum", title: "Maximum", icon: "stacked-bars-4-16" },
];

export const REASONING_OPTIONS: Option<ReasoningEffort>[] = [
  { value: "none", title: "None", icon: "circle-disabled-16" },
  { value: "low", title: "Low", icon: "stacked-bars-1-16" },
  { value: "medium", title: "Medium", icon: "stacked-bars-2-16" },
  { value: "high", title: "High", icon: "stacked-bars-3-16" },
];

export const OUTPUT_OPTIONS: Option<AICommandOutput>[] = [
  { value: "quick-ai", title: "Show in Quick AI", icon: "stars-16" },
  { value: "window", title: "Open in AI Chat", icon: "speech-bubble-16" },
  { value: "paste", title: "Paste to Active App", icon: "clipboard-16" },
  { value: "copy", title: "Copy to Clipboard", icon: "copy-clipboard-16" },
  { value: "replace", title: "Replace Selection", icon: "replace-16" },
];

const titleOf = <T extends string>(options: Option<T>[], value: T | undefined): string | undefined => options.find((o) => o.value === value)?.title;

export const creativityLabel = (value: Creativity | undefined) => titleOf(CREATIVITY_OPTIONS, value) ?? "Medium";
export const reasoningLabel = (value: ReasoningEffort | undefined) => titleOf(REASONING_OPTIONS, value);
export const outputLabel = (value: AICommandOutput | undefined) => titleOf(OUTPUT_OPTIONS, value) ?? "Show in Quick AI";

/** The model a "Default" selection runs with: the purpose's setting when it is available, else the first model (as the backend does). */
export function defaultModel(settingRef: string | null | undefined, models: AIModelOption[] | undefined): AIModelOption | undefined {
  if (!models?.length) return undefined;
  return models.find((m) => m.ref === settingRef) ?? models[0];
}

/** Display name for a stored model ref; unset shows "Default (<model>)". */
export function modelLabel(ref: string | undefined, models: AIModelOption[] | undefined, settingRef: string | null | undefined): string {
  if (!ref) {
    const fallback = defaultModel(settingRef, models);
    return fallback ? `Default (${fallback.name})` : "Default";
  }
  const model = models?.find((m) => m.ref === ref);
  if (model) return model.name;
  return `${ref.slice(ref.indexOf("/") + 1)} (Unavailable)`;
}

/** Whether the model a ref (or "Default") resolves to can reason, so reasoning effort applies. */
export function supportsReasoning(ref: string | undefined, models: AIModelOption[] | undefined, settingRef: string | null | undefined): boolean {
  const model = ref ? models?.find((m) => m.ref === ref) : defaultModel(settingRef, models);
  return Boolean(model?.capabilities.reasoning);
}

/** Dropdown sections for a model picker: "Default" first, then models grouped by provider. */
export function modelSections(models: AIModelOption[] | undefined, settingRef: string | null | undefined, current?: string): { title?: string; items: { value: string; title: string }[] }[] {
  const sections: { title?: string; items: { value: string; title: string }[] }[] = [{ items: [{ value: "", title: modelLabel(undefined, models, settingRef) }] }];
  const byProvider = new Map<string, { value: string; title: string }[]>();
  for (const model of models ?? []) {
    const items = byProvider.get(model.providerName) ?? [];
    items.push({ value: model.ref, title: model.name });
    byProvider.set(model.providerName, items);
  }
  for (const [title, items] of byProvider) sections.push({ title, items });
  if (current && !models?.some((m) => m.ref === current)) sections.push({ title: "Unavailable", items: [{ value: current, title: modelLabel(current, models, settingRef) }] });
  return sections;
}

const TAG_COLORS: NamedColor[] = ["raycast-blue", "raycast-green", "raycast-magenta", "raycast-orange", "raycast-purple", "raycast-red", "raycast-yellow"];

/** Stable color per tag name so a tag looks the same everywhere. */
export function tagColor(tag: string): NamedColor {
  let hash = 0;
  for (const char of tag.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TAG_COLORS[hash % TAG_COLORS.length];
}

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatTimestamp(ms: number): string {
  return dateFormat.format(new Date(ms));
}
