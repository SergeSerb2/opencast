import { useRef, useState } from "react";
import type { AICommand, AICommandOutput, Creativity, ImageLike } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { useSetting } from "../../../bridge/settings";
import { Action, ActionPanel, Checkbox, Dropdown, showToast, TagInput, TextField, Tooltip, useNavigation } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { EditorField, EditorView } from "../ai-shared/EditorView";
import { IconPicker } from "../ai-shared/IconPicker";
import { CREATIVITY_OPTIONS, modelSections, OUTPUT_OPTIONS, REASONING_OPTIONS, supportsReasoning, type ReasoningEffort } from "../ai-shared/options";
import { commandDraft, commandUpsertParams, emptyCommandDraft, validateCommandDraft, type CommandDraft, type CommandDraftErrors, type EditorMode } from "./command-form";
import { PROMPT_PLACEHOLDERS } from "./placeholders";
import { PromptEditor, type PromptEditorHandle } from "./PromptEditor";
import "./ai-commands.css";

export interface AICommandEditorProps {
  mode: EditorMode;
  /** The command to edit or duplicate. */
  command?: AICommand;
  /** Prompt to start with when creating (root search fallback text). */
  initialPrompt?: string;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  isLoading?: boolean;
}

const SUBMIT_TITLE: Record<EditorMode, string> = { create: "Create AI Command", edit: "Save AI Command", duplicate: "Duplicate AI Command" };
const SUCCESS_TITLE: Record<EditorMode, string> = { create: "AI command created", edit: "AI command saved", duplicate: "AI command duplicated" };
const REASONING_ITEMS = [{ value: "", title: "Default", icon: "circle-progress-50-16" }, ...REASONING_OPTIONS];

/** Create, edit or duplicate an AI command: prompt with placeholder help on the left, settings on the right. */
export function AICommandEditor({ mode, command, initialPrompt, navigationTitle, navigationIcon, isLoading }: AICommandEditorProps) {
  const navigation = useNavigation();
  const [draft, setDraft] = useState<CommandDraft>(() => (mode === "create" ? emptyCommandDraft(initialPrompt) : commandDraft(command, mode)));
  const [errors, setErrors] = useState<CommandDraftErrors>({});
  const promptRef = useRef<PromptEditorHandle>(null);
  const { data: models } = useBackend("ai.models.list", {});
  const commandsModel = useSetting("ai.commandsModel");
  const submitting = useRef(false);

  const update = <K extends keyof CommandDraft>(key: K, value: CommandDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    if (submitting.current) return;
    const found = validateCommandDraft(draft);
    setErrors(found);
    const problems = Object.values(found).filter((problem): problem is string => Boolean(problem));
    if (problems.length) {
      showToast({ style: "failure", title: problems.length > 1 ? "Check the highlighted fields" : problems[0] });
      return;
    }
    submitting.current = true;
    const toast = showToast({ style: "animated", title: mode === "edit" ? "Saving AI command…" : "Creating AI command…" });
    try {
      const saved = await backend.call("ai.commands.upsert", commandUpsertParams(draft, mode === "edit" ? command : undefined));
      toast.update({ style: "success", title: SUCCESS_TITLE[mode], message: saved.name });
      navigation.pop();
    } catch (error) {
      toast.update({ style: "failure", title: "Couldn't save the AI command", message: errorMessage(error) });
    } finally {
      submitting.current = false;
    }
  };

  const showReasoning = supportsReasoning(draft.model || undefined, models, commandsModel);

  return (
    <EditorView
      navigationTitle={navigationTitle ?? SUBMIT_TITLE[mode]}
      navigationIcon={navigationIcon}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action title={SUBMIT_TITLE[mode]} icon="checkmark-16" onAction={submit} />
          <ActionPanel.Section>
            <ActionPanel.Submenu title="Insert Placeholder" icon="text-input-16" placeholder="Search placeholders…">
              {PROMPT_PLACEHOLDERS.map((option) => (
                <Action key={option.id} title={option.title} icon={option.icon} onAction={() => promptRef.current?.insert(option)} />
              ))}
            </ActionPanel.Submenu>
          </ActionPanel.Section>
        </ActionPanel>
      }
      main={
        <>
          <div className="sc-ai-editor__descriptive">
            <label className="sc-ai-editor__label" id="ai-command-prompt-label" htmlFor="ai-command-prompt">
              Prompt
            </label>
            {errors.prompt && (
              <span className="sc-ai-editor__error" role="alert">
                {errors.prompt}
              </span>
            )}
          </div>
          <PromptEditor ref={promptRef} id="ai-command-prompt" aria-labelledby="ai-command-prompt-label" value={draft.prompt} invalid={Boolean(errors.prompt)} onChange={(prompt) => update("prompt", prompt)} />
          <p className="sc-ai-editor__help">
            Type <span className="sc-ai-editor__help-accent">{"{"}</span> to add{" "}
            <button type="button" className="sc-ai-editor__help-link" onMouseDown={(e) => e.preventDefault()} onClick={() => promptRef.current?.openPlaceholderMenu()}>
              Dynamic Placeholders
            </button>{" "}
            such as the selected text, the clipboard or an argument.
          </p>
        </>
      }
    >
      <EditorField label="Name & Icon" htmlFor="ai-command-name" error={errors.name}>
        <TextField
          id="ai-command-name"
          value={draft.name}
          onChange={(name) => update("name", name)}
          placeholder="AI command name"
          validation={errors.name ? "error" : undefined}
          accessory={<IconPicker value={draft.icon} onChange={(icon) => update("icon", icon)} />}
        />
      </EditorField>
      <EditorField label="Model">
        <Dropdown aria-label="Model" value={draft.model} sections={modelSections(models, commandsModel, draft.model)} placeholder="Select a model" searchPlaceholder="Search models…" onChange={(model) => update("model", model)} />
      </EditorField>
      <EditorField label="Creativity">
        <Dropdown aria-label="Creativity" value={draft.creativity} items={CREATIVITY_OPTIONS} onChange={(value) => update("creativity", value as Creativity)} />
      </EditorField>
      {showReasoning && (
        <EditorField label="Reasoning Effort">
          <Dropdown aria-label="Reasoning Effort" value={draft.reasoningEffort} items={REASONING_ITEMS} onChange={(value) => update("reasoningEffort", value as ReasoningEffort | "")} />
        </EditorField>
      )}
      <EditorField label="Output">
        <Dropdown aria-label="Output" value={draft.output} items={OUTPUT_OPTIONS} onChange={(value) => update("output", value as AICommandOutput)} />
        <div className="sc-ai-editor__option">
          <Checkbox checked={draft.highlightEdits} onChange={(value) => update("highlightEdits", value)} label="Highlight edits" />
          <Tooltip content="Marks what the response changed compared to your input, which helps with rewriting commands.">
            <span className="sc-ai-editor__info" aria-label="About highlighting edits">
              <Icon name="info-01-16" size={14} />
            </span>
          </Tooltip>
        </div>
        <div className="sc-ai-editor__option">
          <Checkbox checked={draft.webSearch} onChange={(value) => update("webSearch", value)} label="Search the web" />
          <Tooltip content="Lets the model look things up online. Needs a web search provider in AI settings or a model with built-in search.">
            <span className="sc-ai-editor__info" aria-label="About web search">
              <Icon name="info-01-16" size={14} />
            </span>
          </Tooltip>
        </div>
      </EditorField>
      <EditorField label="Tags">
        <TagInput value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder="Tags" aria-label="Tags" />
      </EditorField>
    </EditorView>
  );
}
