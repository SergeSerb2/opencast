import { useState } from "react";
import type { AICommand, AICommandOutput, AIPreset, BackendParams, Creativity, ImageLike } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { Button } from "../../../components/Button/Button";
import { Checkbox } from "../../../components/Checkbox/Checkbox";
import { TextArea } from "../../../components/TextArea/TextArea";
import { TextField } from "../../../components/TextField/TextField";
import { Select } from "../../ui/controls";
import { Dialog, DialogField } from "../../ui/Dialog";
import { ModelPicker } from "./shared";

export const ICONS = [
  "stars-16",
  "wand-16",
  "pencil-16",
  "text-16",
  "code-16",
  "bug-16",
  "light-bulb-16",
  "globe-01-16",
  "speech-bubble-16",
  "book-16",
  "envelope-16",
  "calendar-16",
  "terminal-16",
  "magnifying-glass-16",
  "bolt-16",
  "brush-16",
  "hammer-16",
  "person-16",
  "heart-16",
  "check-list-16",
];
const ICON_OPTIONS = ICONS.map((icon) => ({
  value: icon,
  title: icon
    .replace(/-(01-)?16$/, "")
    .replace(/-/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase()),
  icon,
}));

export const CREATIVITY: { value: Creativity; title: string }[] = [
  { value: "none", title: "None — most predictable" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
  { value: "maximum", title: "Maximum — most varied" },
];

type Effort = NonNullable<AICommand["reasoningEffort"]>;
const REASONING: { value: Effort | null; title: string }[] = [
  { value: null, title: "Model Default" },
  { value: "none", title: "None" },
  { value: "low", title: "Low" },
  { value: "medium", title: "Medium" },
  { value: "high", title: "High" },
];

export const OUTPUT_LABELS: Record<AICommandOutput, string> = {
  "quick-ai": "Show in Quick AI",
  window: "Open in AI Chat",
  paste: "Paste Response",
  copy: "Copy Response",
  replace: "Replace Selection",
};

const PLACEHOLDER_HELP = 'Placeholders: {selection}, {clipboard}, {argument name="topic"}, {browser-tab}, {focused-app}, {date}, {time}.';

function iconValue(icon: ImageLike | undefined): string {
  return typeof icon === "string" && ICONS.includes(icon) ? icon : "stars-16";
}

/** Prompts may contain JSON or code braces as well as placeholders. */
export function promptProblem(prompt: string): string | null {
  return prompt.trim() ? null : "Write the prompt";
}

/** Create or edit an AI Command. */
export function CommandEditor({ command, onClose }: { command: AICommand | null; onClose: () => void }) {
  const [draft, setDraft] = useState<BackendParams<"ai.commands.upsert">>(() => command ?? { name: "", prompt: "", creativity: "low", output: "quick-ai", icon: "stars-16" });
  const [errors, setErrors] = useState<{ name?: string; prompt?: string; save?: string }>({});
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<BackendParams<"ai.commands.upsert">>) => {
    setDraft({ ...draft, ...patch });
    setErrors({});
  };
  const save = async () => {
    const problems = { name: draft.name.trim() ? undefined : "Give the command a name", prompt: promptProblem(draft.prompt) ?? undefined };
    if (problems.name || problems.prompt) return setErrors(problems);
    setBusy(true);
    try {
      await backend.call("ai.commands.upsert", { ...draft, name: draft.name.trim() });
      onClose();
    } catch (error) {
      setErrors({ save: errorMessage(error) });
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={command ? "Edit AI Command" : "Create AI Command"}
      onClose={onClose}
      width={520}
      footer={
        <>
          {errors.save && <span className="sc-s-missing sc-s-dialog__footer-start">{errors.save}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {command ? "Save" : "Create Command"}
          </Button>
        </>
      }
    >
      <div className="sc-s-editor-grid">
        <DialogField label="Name" error={errors.name}>
          <TextField value={draft.name} onChange={(name) => update({ name })} placeholder="Summarize" />
        </DialogField>
        <DialogField label="Icon">
          <Select variant="field" value={iconValue(draft.icon)} options={ICON_OPTIONS} onChange={(icon) => update({ icon })} label="Icon" searchable />
        </DialogField>
      </div>
      <DialogField label="Prompt" hint={PLACEHOLDER_HELP} error={errors.prompt}>
        <TextArea
          value={draft.prompt}
          onChange={(prompt) => update({ prompt })}
          placeholder={"Summarize this in three bullet points:\n\n{selection}"}
          minHeight={120}
          maxHeight={240}
          validation={errors.prompt ? "error" : undefined}
        />
      </DialogField>
      <div className="sc-s-editor-grid">
        <DialogField label="Output">
          <Select
            variant="field"
            value={draft.output ?? "quick-ai"}
            options={(Object.keys(OUTPUT_LABELS) as AICommandOutput[]).map((value) => ({ value, title: OUTPUT_LABELS[value] }))}
            onChange={(output) => update({ output })}
            label="Output"
          />
        </DialogField>
        <DialogField label="Model">
          <ModelPicker value={draft.model ?? null} onChange={(model) => update({ model })} label="Model" automaticTitle="Default for AI Commands" />
        </DialogField>
        <DialogField label="Creativity">
          <Select variant="field" value={draft.creativity ?? "medium"} options={CREATIVITY} onChange={(creativity) => update({ creativity })} label="Creativity" />
        </DialogField>
        <DialogField label="Reasoning Effort">
          <Select<Effort | null>
            variant="field"
            value={draft.reasoningEffort ?? null}
            options={REASONING}
            onChange={(effort) => update({ reasoningEffort: effort })}
            label="Reasoning Effort"
          />
        </DialogField>
      </div>
      <Checkbox checked={Boolean(draft.webSearch)} onChange={(webSearch) => update({ webSearch })} label="Allow web search" />
      {draft.output === "replace" && <Checkbox checked={Boolean(draft.highlightEdits)} onChange={(highlightEdits) => update({ highlightEdits })} label="Highlight edits in the response" />}
    </Dialog>
  );
}

/** Create or edit an Agent (chat preset). */
export function PresetEditor({ preset, onClose }: { preset: AIPreset | null; onClose: () => void }) {
  const { data: tools } = useBackend("ai.tools.list", undefined);
  const toolsets = [...new Map((tools ?? []).filter((t) => t.toolset !== "web").map((t) => [t.toolset, t.toolsetTitle]))];
  const [draft, setDraft] = useState<BackendParams<"ai.presets.upsert">>(() => preset ?? { name: "", instructions: "", creativity: "medium", webSearch: false, tools: [], icon: "stars-16" });
  const [errors, setErrors] = useState<{ name?: string; save?: string }>({});
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<BackendParams<"ai.presets.upsert">>) => {
    setDraft({ ...draft, ...patch });
    setErrors({});
  };
  const selectedTools = new Set(draft.tools ?? []);
  const save = async () => {
    if (!draft.name.trim()) return setErrors({ name: "Give the agent a name" });
    setBusy(true);
    try {
      await backend.call("ai.presets.upsert", { ...draft, name: draft.name.trim(), tools: [...selectedTools] });
      onClose();
    } catch (error) {
      setErrors({ save: errorMessage(error) });
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={preset ? "Edit Agent" : "Create Agent"}
      onClose={onClose}
      width={520}
      footer={
        <>
          {errors.save && <span className="sc-s-missing sc-s-dialog__footer-start">{errors.save}</span>}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {preset ? "Save" : "Create Agent"}
          </Button>
        </>
      }
    >
      <div className="sc-s-editor-grid">
        <DialogField label="Name" error={errors.name}>
          <TextField value={draft.name} onChange={(name) => update({ name })} placeholder="Writing Coach" />
        </DialogField>
        <DialogField label="Icon">
          <Select variant="field" value={iconValue(draft.icon)} options={ICON_OPTIONS} onChange={(icon) => update({ icon })} label="Icon" searchable />
        </DialogField>
      </div>
      <DialogField label="Description">
        <TextField value={draft.description ?? ""} onChange={(description) => update({ description })} placeholder="Shown under the name in pickers" />
      </DialogField>
      <DialogField label="Instructions" hint="Added as the system prompt of every chat with this agent.">
        <TextArea
          value={draft.instructions ?? ""}
          onChange={(instructions) => update({ instructions })}
          placeholder="You are a patient writing coach. Point out one improvement at a time."
          minHeight={110}
          maxHeight={220}
        />
      </DialogField>
      <div className="sc-s-editor-grid">
        <DialogField label="Model">
          <ModelPicker value={draft.model ?? null} onChange={(model) => update({ model })} label="Model" automaticTitle="Default for AI Chat" />
        </DialogField>
        <DialogField label="Creativity">
          <Select variant="field" value={draft.creativity ?? "medium"} options={CREATIVITY} onChange={(creativity) => update({ creativity })} label="Creativity" />
        </DialogField>
        <DialogField label="Reasoning Effort">
          <Select<Effort | null>
            variant="field"
            value={draft.reasoningEffort ?? null}
            options={REASONING}
            onChange={(effort) => update({ reasoningEffort: effort })}
            label="Reasoning Effort"
          />
        </DialogField>
      </div>
      <DialogField label="Tools">
        <div className="sc-s-checklist__items sc-s-checklist__items--flat">
          <Checkbox checked={Boolean(draft.webSearch)} onChange={(webSearch) => update({ webSearch })} label="Web Search" />
          {toolsets.map(([id, title]) => (
            <Checkbox
              key={id}
              checked={selectedTools.has(id)}
              onChange={(on) => {
                const next = new Set(selectedTools);
                if (on) next.add(id);
                else next.delete(id);
                update({ tools: [...next] });
              }}
              label={title}
            />
          ))}
        </div>
      </DialogField>
    </Dialog>
  );
}
