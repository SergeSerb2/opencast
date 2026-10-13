import { useMemo, useRef, useState } from "react";
import type { AIPreset, Creativity, ImageLike } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Checkbox, Dropdown, showToast, TagInput, TextField, Tooltip, useNavigation } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { EditorField, EditorView } from "../ai-shared/EditorView";
import { IconPicker } from "../ai-shared/IconPicker";
import { CREATIVITY_OPTIONS, modelSections, REASONING_OPTIONS, supportsReasoning, type ReasoningEffort } from "../ai-shared/options";
import { TextEditor } from "../ai-shared/TextEditor";
import { emptyPresetDraft, presetDraft, presetUpsertParams, toolsetOptions, validatePresetDraft, type PresetDraft, type PresetDraftErrors, type PresetEditorMode } from "./preset-form";

export interface AIPresetEditorProps {
  mode: PresetEditorMode;
  preset?: AIPreset;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  isLoading?: boolean;
}

const SUBMIT_TITLE: Record<PresetEditorMode, string> = { create: "Create Preset", edit: "Save Preset", duplicate: "Duplicate Preset" };
const SUCCESS_TITLE: Record<PresetEditorMode, string> = { create: "Preset created", edit: "Preset saved", duplicate: "Preset duplicated" };
const REASONING_ITEMS = [{ value: "", title: "Default", icon: "circle-progress-50-16" }, ...REASONING_OPTIONS];

/** Create, edit or duplicate a preset (Raycast "agent"): instructions on the left, chat settings on the right. */
export function AIPresetEditor({ mode, preset, navigationTitle, navigationIcon, isLoading }: AIPresetEditorProps) {
  const navigation = useNavigation();
  const [draft, setDraft] = useState<PresetDraft>(() => (mode === "create" ? emptyPresetDraft() : presetDraft(preset, mode)));
  const [errors, setErrors] = useState<PresetDraftErrors>({});
  const { data: models } = useBackend("ai.models.list", {});
  const { data: tools } = useBackend("ai.tools.list", undefined);
  const chatModel = useSetting("ai.chatModel");
  const toolOptions = useMemo(() => toolsetOptions(tools ?? []).map((o) => ({ value: o.value, title: o.title, icon: o.icon })), [tools]);
  const submitting = useRef(false);

  const update = <K extends keyof PresetDraft>(key: K, value: PresetDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    if (submitting.current) return;
    const found = validatePresetDraft(draft);
    setErrors(found);
    if (found.name) {
      showToast({ style: "failure", title: found.name });
      return;
    }
    submitting.current = true;
    const toast = showToast({ style: "animated", title: mode === "edit" ? "Saving preset…" : "Creating preset…" });
    try {
      const saved = await backend.call("ai.presets.upsert", presetUpsertParams(draft, mode === "edit" ? preset : undefined));
      toast.update({ style: "success", title: SUCCESS_TITLE[mode], message: saved.name });
      navigation.pop();
    } catch (error) {
      toast.update({ style: "failure", title: "Couldn't save the preset", message: errorMessage(error) });
    } finally {
      submitting.current = false;
    }
  };

  return (
    <EditorView
      navigationTitle={navigationTitle ?? SUBMIT_TITLE[mode]}
      navigationIcon={navigationIcon}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action title={SUBMIT_TITLE[mode]} icon="checkmark-16" onAction={submit} />
        </ActionPanel>
      }
      main={
        <>
          <div className="sc-ai-editor__descriptive">
            <label className="sc-ai-editor__label" id="ai-preset-instructions-label" htmlFor="ai-preset-instructions">
              Instructions
            </label>
          </div>
          <TextEditor
            id="ai-preset-instructions"
            aria-labelledby="ai-preset-instructions-label"
            value={draft.instructions}
            placeholder="Describe how the assistant should behave in chats with this preset…"
            onChange={(instructions) => update("instructions", instructions)}
          />
          <p className="sc-ai-editor__help">Added as system instructions to every chat you start with this preset. Markdown is supported.</p>
        </>
      }
    >
      <EditorField label="Name & Icon" htmlFor="ai-preset-name" error={errors.name}>
        <TextField
          id="ai-preset-name"
          value={draft.name}
          onChange={(name) => update("name", name)}
          placeholder="Preset name"
          validation={errors.name ? "error" : undefined}
          accessory={<IconPicker value={draft.icon} onChange={(icon) => update("icon", icon)} />}
        />
      </EditorField>
      <EditorField label="Description" htmlFor="ai-preset-description">
        <TextField id="ai-preset-description" value={draft.description} onChange={(description) => update("description", description)} placeholder="What this preset is for" />
      </EditorField>
      <EditorField label="Model">
        <Dropdown aria-label="Model" value={draft.model} sections={modelSections(models, chatModel, draft.model)} placeholder="Select a model" searchPlaceholder="Search models…" onChange={(model) => update("model", model)} />
      </EditorField>
      <EditorField label="Creativity">
        <Dropdown aria-label="Creativity" value={draft.creativity} items={CREATIVITY_OPTIONS} onChange={(value) => update("creativity", value as Creativity)} />
      </EditorField>
      {supportsReasoning(draft.model || undefined, models, chatModel) && (
        <EditorField label="Reasoning Effort">
          <Dropdown aria-label="Reasoning Effort" value={draft.reasoningEffort} items={REASONING_ITEMS} onChange={(value) => update("reasoningEffort", value as ReasoningEffort | "")} />
        </EditorField>
      )}
      <EditorField label="Tools">
        <TagInput value={draft.tools} onChange={(value) => update("tools", value)} options={toolOptions} placeholder={toolOptions.length ? "Add tools" : "No tools available"} aria-label="Tools" />
        <div className="sc-ai-editor__option">
          <Checkbox checked={draft.webSearch} onChange={(value) => update("webSearch", value)} label="Search the web" />
          <Tooltip content="Lets chats with this preset look things up online. Needs a web search provider in AI settings or a model with built-in search.">
            <span className="sc-ai-editor__info" aria-label="About web search">
              <Icon name="info-01-16" size={14} />
            </span>
          </Tooltip>
        </div>
      </EditorField>
    </EditorView>
  );
}
