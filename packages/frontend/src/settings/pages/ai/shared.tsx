import type { AIModelCapabilities, ModelRef } from "@opencast/protocol";
import { useBackend } from "../../../bridge/hooks";
import { Select } from "../../ui/controls";

const MONOGRAMS: Record<string, [string, string]> = {
  openai: ["OA", "#10A37F"],
  anthropic: ["A", "#C96442"],
  google: ["G", "#4285F4"],
  openrouter: ["OR", "#6566F1"],
  groq: ["GQ", "#F55036"],
  mistral: ["M", "#FA520F"],
  xai: ["x", "#3A3A3C"],
  deepseek: ["DS", "#4D6BFE"],
  together: ["T", "#0F6FFF"],
  fireworks: ["F", "#6720FF"],
  perplexity: ["P", "#1F8A8A"],
  cerebras: ["C", "#F15A29"],
  ollama: ["OL", "#4A4A4F"],
  lmstudio: ["LM", "#5B4CDB"],
  cliproxyapi: ["CP", "#2F9E6E"],
  litellm: ["LL", "#0F766E"],
  azure: ["Az", "#0078D4"],
  custom: ["{ }", "#5E6270"],
};

/** Monogram tile for a provider template (OpenCast doesn't ship vendor logos). */
export function providerIcon(template: string, name?: string): string {
  const [letters, color] = MONOGRAMS[template] ?? [(name ?? template).slice(0, 2), "#5E6270"];
  const size = letters.length > 2 ? 11 : letters.length === 2 ? 13 : 16;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.78"/></linearGradient></defs>` +
    `<rect width="40" height="40" rx="10" fill="url(#g)"/>` +
    `<text x="20" y="21" text-anchor="middle" dominant-baseline="middle" font-family="Inter, -apple-system, sans-serif" font-size="${size}" font-weight="700" fill="#fff">${letters.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** "400K", "1M", "8K" for context windows. */
export function formatContext(tokens: number | undefined): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_000_000).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}K`;
}

export const CAPABILITIES: { key: keyof AIModelCapabilities; title: string; icon: string }[] = [
  { key: "vision", title: "Vision", icon: "eye-16" },
  { key: "tools", title: "Tools", icon: "wrench-screwdriver-16" },
  { key: "reasoning", title: "Reasoning", icon: "light-bulb-16" },
];

export function useEnabledModels() {
  return useBackend("ai.models.list", {});
}

export interface ModelPickerProps {
  value: ModelRef | null;
  onChange: (value: ModelRef | null) => void;
  label: string;
  /** Title of the `null` option. */
  automaticTitle?: string;
}

/** Model popup grouped by provider; `null` means "first enabled model". */
export function ModelPicker({ value, onChange, label, automaticTitle = "Automatic" }: ModelPickerProps) {
  const { data: models } = useEnabledModels();
  const providers = [...new Set((models ?? []).map((m) => m.providerName))];
  const missing = value && models && !models.some((m) => m.ref === value);
  return (
    <Select<ModelRef | null>
      value={value}
      onChange={onChange}
      label={label}
      searchable={(models?.length ?? 0) > 10}
      sections={[
        { options: [{ value: null, title: automaticTitle }, ...(missing ? [{ value, title: `${value} (unavailable)` }] : [])] },
        ...providers.map((provider) => ({
          title: provider,
          options: (models ?? []).filter((m) => m.providerName === provider).map((m) => ({ value: m.ref, title: m.name })),
        })),
      ]}
    />
  );
}

export function useKeySyncState() {
  const { data } = useBackend("settings.getAll", undefined, [], { refetchOn: [{ topic: "settings.changed", when: ({ key }) => key === "sync.enabled" || key === "sync.optInCategories" }] });
  return { enabled: data?.["sync.enabled"] ?? false, keysEnabled: data?.["sync.optInCategories"]?.includes("ai-keys") ?? false };
}

export function missingKeyStatus(names: string[], waiting: boolean) {
  return {
    label: waiting ? "Waiting for Key from Another Mac" : "Needs Key on This Mac",
    description: `Missing: ${names.join(", ")}.${waiting ? " The key will arrive with the next sync if another Mac has it." : " Add the key on this Mac."}`,
  };
}

export function MissingKeyBadge({ names, waiting }: { names: string[]; waiting: boolean }) {
  if (!names.length) return null;
  const status = missingKeyStatus(names, waiting);
  return <span className="sc-s-badge" data-tone="warning" title={status.description}>{status.label}</span>;
}
