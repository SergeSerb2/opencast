import { useEffect, useState } from "react";
import type { AIModelOption, AIPreset, Creativity, ModelRef } from "@surgecast/protocol";
import { Dropdown } from "../../components/Dropdown/Dropdown";
import { IconButton } from "../../components/Button/Button";
import { Switch } from "../../components/Switch/Switch";
import { TextArea } from "../../components/TextArea/TextArea";
import { Image } from "../../icons/Image";
import type { Toolset } from "../model/mentions";
import { findModel, groupByProvider } from "../model/models";
import type { ChatSetup } from "../state/send";

export interface ChatSettingsPaneProps {
  setup: ChatSetup;
  onChange: (patch: ChatSetup) => void;
  models: readonly AIModelOption[];
  presets: readonly AIPreset[];
  toolsets: readonly Toolset[];
  onClose: () => void;
  /** Overlays the transcript when the window is too narrow for an inline pane. */
  overlay: boolean;
}

const CREATIVITY: { value: Creativity; title: string }[] = [
  { value: "none", title: "None" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
  { value: "maximum", title: "Maximum" },
];

const REASONING = [
  { value: "none", title: "None" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
] as const;

const NO_PRESET = "__none__";

/** Per-chat model, preset, creativity, tools and instructions (right pane, 300px). */
export function ChatSettingsPane({ setup, onChange, models, presets, toolsets, onClose, overlay }: ChatSettingsPaneProps) {
  const [instructions, setInstructions] = useState(setup.systemInstructions ?? "");
  useEffect(() => setInstructions(setup.systemInstructions ?? ""), [setup.systemInstructions]);
  const model = findModel(models, setup.model);
  const tools = setup.tools ?? [];
  const toggleTool = (id: string, on: boolean) => onChange({ tools: on ? [...tools.filter((t) => t !== id), id] : tools.filter((t) => t !== id) });

  return (
    <aside className={`sc-ai-settings${overlay ? " sc-glass-panel" : ""}`} data-overlay={overlay || undefined} aria-label="Chat Settings">
      <div className="sc-ai-settings__header">
        <span>Chat Settings</span>
        <IconButton icon="xmark-16" label="Close" size={24} onClick={onClose} />
      </div>
      <div className="sc-ai-settings__body sc-no-scrollbar">
        <label className="sc-ai-settings__field">
          <span className="sc-ai-settings__label">Model</span>
          <Dropdown
            value={setup.model}
            onChange={(ref: ModelRef) => onChange({ model: ref })}
            sections={groupByProvider(models).map((g) => ({ title: g.providerName, items: g.models.map((m) => ({ value: m.ref, title: m.name, keywords: [m.modelId] })) }))}
            placeholder="Choose a model"
            searchPlaceholder="Search models…"
            aria-label="Model"
          />
        </label>
        <label className="sc-ai-settings__field">
          <span className="sc-ai-settings__label">Preset</span>
          <Dropdown
            value={setup.presetId ?? NO_PRESET}
            onChange={(value) => {
              const preset = presets.find((p) => p.id === value);
              onChange(preset ? { presetId: preset.id, model: preset.model ?? setup.model, creativity: preset.creativity, webSearch: preset.webSearch, tools: preset.tools } : { presetId: undefined });
            }}
            items={[{ value: NO_PRESET, title: "None" }, ...presets.map((p) => ({ value: p.id, title: p.name, icon: p.icon }))]}
            aria-label="Preset"
          />
        </label>
        <label className="sc-ai-settings__field">
          <span className="sc-ai-settings__label">Creativity</span>
          <Dropdown value={setup.creativity ?? "medium"} onChange={(value) => onChange({ creativity: value as Creativity })} items={CREATIVITY} aria-label="Creativity" />
        </label>
        {model?.capabilities.reasoning && (
          <label className="sc-ai-settings__field">
            <span className="sc-ai-settings__label">Reasoning Effort</span>
            <Dropdown value={setup.reasoningEffort ?? "medium"} onChange={(value) => onChange({ reasoningEffort: value as ChatSetup["reasoningEffort"] })} items={[...REASONING]} aria-label="Reasoning Effort" />
          </label>
        )}
        <div className="sc-ai-settings__row">
          <span className="sc-ai-settings__text">
            <span className="sc-ai-settings__row-title">Web Search</span>
            <span className="sc-ai-settings__row-subtitle">Uses the search provider from Settings → AI</span>
          </span>
          <Switch checked={Boolean(setup.webSearch)} onChange={(webSearch) => onChange({ webSearch })} label="Web Search" />
        </div>
        {toolsets.filter((t) => t.kind !== "web").length > 0 && (
          <div className="sc-ai-settings__group">
            <span className="sc-ai-settings__label">Tools</span>
            {toolsets
              .filter((t) => t.kind !== "web")
              .map((toolset) => (
                <div key={toolset.id} className="sc-ai-settings__row">
                  <span className="sc-ai-settings__tool">
                    <Image source={toolset.icon ?? (toolset.kind === "mcp" ? "plug-16" : "hammer-16")} size={16} />
                    <span className="sc-ai-settings__text">
                      <span className="sc-ai-settings__row-title">{toolset.title}</span>
                      <span className="sc-ai-settings__row-subtitle">
                        @{toolset.mention} · {toolset.tools.length} {toolset.tools.length === 1 ? "tool" : "tools"}
                      </span>
                    </span>
                  </span>
                  <Switch checked={tools.includes(toolset.id)} onChange={(on) => toggleTool(toolset.id, on)} label={toolset.title} />
                </div>
              ))}
          </div>
        )}
        <label className="sc-ai-settings__field">
          <span className="sc-ai-settings__label">Instructions</span>
          <TextArea
            value={instructions}
            onChange={setInstructions}
            onBlur={() => instructions !== (setup.systemInstructions ?? "") && onChange({ systemInstructions: instructions })}
            placeholder="Additional instructions for this chat"
            minHeight={80}
            maxHeight={200}
          />
        </label>
      </div>
    </aside>
  );
}
