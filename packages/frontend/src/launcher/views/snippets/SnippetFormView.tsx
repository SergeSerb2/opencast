import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ImageLike, Snippet } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { errorMessage } from "../../../bridge/errors";
import { native } from "../../../bridge/native";
import { Action, ActionPanel, Form, showToast, TagInput, TextField, useNavigation, useRegisterActions, ViewFrame } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { IconPicker } from "../library/IconPicker";
import { DOCS } from "../library/links";
import { TemplateEditor, type TemplateEditorHandle } from "./TemplateEditor";
import { snippetPayload, validateSnippetDraft, type SnippetDraft, type SnippetErrors } from "./snippet-validation";
import "./snippet-form.css";

export const DEFAULT_SNIPPET_ICON = "blank-document-16";

export interface SnippetFormViewProps {
  /** Edit this snippet; otherwise create a new one. */
  snippet?: Snippet;
  /** Prefill for a new snippet (duplicate, "Save as Snippet", search text). */
  initial?: Partial<Pick<Snippet, "name" | "text" | "keyword" | "tags" | "icon">>;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  /** Called after a successful save; defaults to popping the view. */
  onSaved?: (snippet: Snippet) => void;
}

function draftFrom(snippet: SnippetFormViewProps["snippet"] | SnippetFormViewProps["initial"]): SnippetDraft {
  return { name: snippet?.name ?? "", text: snippet?.text ?? "", keyword: snippet?.keyword ?? "", tags: snippet?.tags ?? [], icon: snippet?.icon || DEFAULT_SNIPPET_ICON };
}

/**
 * Create/Edit Snippet: Raycast's two-column editor — snippet text with
 * dynamic placeholders on the left; name, icon, keyword and tags on the right.
 */
export function SnippetFormView({ snippet, initial, navigationTitle, navigationIcon, onSaved }: SnippetFormViewProps) {
  return (
    <ViewFrame
      navigationTitle={navigationTitle ?? (snippet ? "Edit Snippet" : "Create Snippet")}
      navigationIcon={navigationIcon}
      headerAccessory={<Form.LinkAccessory text="Snippets Guide" target={DOCS.snippets} />}
      primaryShortcut="cmd-enter"
    >
      <SnippetFormBody snippet={snippet} initial={initial} onSaved={onSaved} />
    </ViewFrame>
  );
}

function SnippetFormBody({ snippet, initial, onSaved }: Pick<SnippetFormViewProps, "snippet" | "initial" | "onSaved">) {
  const navigation = useNavigation();
  const [draft, setDraft] = useState<SnippetDraft>(() => draftFrom(snippet ?? initial));
  const [errors, setErrors] = useState<SnippetErrors>({});
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<TemplateEditorHandle>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const others = useRef<Snippet[]>([]);

  useEffect(() => {
    backend
      .call("snippets.list", {})
      .then((list) => (others.current = list))
      .catch(() => undefined);
    // A prefilled duplicate focuses the name, like Raycast; otherwise the snippet text.
    if (initial?.name && !snippet) nameRef.current?.select();
    else editorRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = <K extends keyof SnippetDraft>(key: K, value: SnippetDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const save = async () => {
    if (saving) return;
    const found = validateSnippetDraft(draft, others.current, snippet?.id);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    try {
      const payload = snippetPayload(draft);
      const saved = snippet ? await backend.call("snippets.update", { id: snippet.id, patch: payload }) : await backend.call("snippets.create", { ...payload, pinned: false });
      showToast({ title: snippet ? "Snippet updated" : "Created snippet", message: saved.name });
      if (onSaved) onSaved(saved);
      else navigation.pop();
    } catch (error) {
      showToast({ style: "failure", title: snippet ? "Failed to update snippet" : "Failed to create snippet", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  useRegisterActions(
    <ActionPanel>
      <Action title="Save Snippet" icon="checkmark-16" onAction={save} />
      <Action title="Add Placeholder" icon="text-input-16" onAction={() => editorRef.current?.startPlaceholder()} />
    </ActionPanel>,
  );

  return (
    <div className="sc-snippet-form">
      <div className="sc-snippet-form__column">
        <FieldLabel title="Snippet" error={errors.text} htmlFor="snippet-text" />
        <TemplateEditor
          ref={editorRef}
          id="snippet-text"
          context="snippet"
          multiline
          value={draft.text}
          onChange={(text) => update("text", text)}
          placeholder="Find your inner Shakespeare…"
          invalid={Boolean(errors.text)}
          aria-label="Snippet"
          toolbar={
            <div className="sc-snippet-form__toolbar">
              <button type="button" className="sc-snippet-form__tool" title="Add Placeholder  {" aria-label="Add Placeholder" onMouseDown={(e) => e.preventDefault()} onClick={() => editorRef.current?.startPlaceholder()}>
                <Icon name="text-input-16" size={16} />
              </button>
            </div>
          }
        />
        <p className="sc-snippet-form__help">
          Include{" "}
          <a href={DOCS.placeholders} onClick={(e) => openLink(e, DOCS.placeholders)}>
            {"{Dynamic Placeholders}"}
          </a>{" "}
          for context like the copied text or the current date
        </p>
      </div>
      <div className="sc-snippet-form__column">
        <FieldLabel title="Name & Icon" error={errors.name} htmlFor="snippet-name" />
        <TextField
          ref={nameRef}
          id="snippet-name"
          value={draft.name}
          onChange={(name) => update("name", name)}
          placeholder="Snippet name"
          validation={errors.name ? "error" : undefined}
          accessory={<IconPicker value={draft.icon} onChange={(icon) => update("icon", icon)} aria-label="Snippet icon" />}
        />
        <FieldLabel title="Keyword" error={errors.keyword} htmlFor="snippet-keyword" spaced />
        <TextField id="snippet-keyword" value={draft.keyword} onChange={(keyword) => update("keyword", keyword)} placeholder="Keyword" validation={errors.keyword ? "error" : undefined} />
        <FieldLabel title="Tags" htmlFor="snippet-tags" spaced />
        <TagInput id="snippet-tags" value={draft.tags} onChange={(tags) => update("tags", tags)} placeholder="Tags" aria-label="Tags" />
      </div>
    </div>
  );
}

function openLink(event: { preventDefault: () => void }, url: string) {
  event.preventDefault();
  void native.call("open.url", { url }).catch(() => undefined);
}

function FieldLabel({ title, error, htmlFor, spaced }: { title: string; error?: string; htmlFor: string; spaced?: boolean }): ReactNode {
  return (
    <div className="sc-snippet-form__label" data-spaced={spaced || undefined}>
      <label htmlFor={htmlFor}>{title}</label>
      {error && (
        <span className="sc-snippet-form__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
