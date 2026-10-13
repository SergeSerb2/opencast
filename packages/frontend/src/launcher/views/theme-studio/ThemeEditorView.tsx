import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ImageLike, Theme } from "@surgecast/protocol";
import { backend } from "../../../bridge/backend";
import { useBackend } from "../../../bridge/hooks";
import { useSettings } from "../../../bridge/settings";
import { Action, ActionPanel, confirmAlert, ScrollArea, SegmentedControl, showFailureToast, showToast, TextField, useNavigation, useRegisterActions, ViewFrame } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { sc } from "../../../lib/keyboard";
import { useTheme } from "../../../theme/ThemeProvider";
import { paletteFromTheme, type Palette } from "../../../theme/palettes";
import { applyThemeSettings, themeSettingsUpdate } from "./apply-theme";
import { copyWithToast, readClipboardText } from "./clipboard";
import { ColorField } from "./ColorField";
import { COLOR_GROUPS, draftFromPalette, draftToPalette, draftToUpsert, hasErrors, isSameDraft, normalizeHex, parseThemeJson, previewHex, themeToJson, validateDraft, type ColorKey, type DraftErrors, type ThemeDraft } from "./theme-draft";
import { ThemeMiniLauncher } from "./ThemeMiniLauncher";
import "./theme-studio.css";

export interface ThemeEditorViewProps {
  initialDraft: ThemeDraft;
  /** Colors for fields that do not hold a valid color yet. */
  basePalette: Palette;
  /** Name of the built-in theme this draft copies; saving creates a new theme. */
  copiedFrom?: string;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  onSaved?: (theme: Theme) => void;
  /** Offer "Switch Theme…" (the editor that Show Theme Studio opens). */
  onBrowse?: () => void;
}

const APPEARANCES = [
  { value: "dark" as const, title: "Dark", icon: "moon-16" },
  { value: "light" as const, title: "Light", icon: "sun-16" },
];

const FIELD_ORDER: ("name" | ColorKey)[] = ["name", ...COLOR_GROUPS.flatMap((g) => g.fields.map((f) => f.key))];

/**
 * Theme Studio editor: name, appearance and the thirteen theme colors on the
 * left, a live miniature launcher on the right. Saving upserts a user theme
 * (a copy when the source is built in).
 */
export function ThemeEditorView({ initialDraft, basePalette, copiedFrom, navigationTitle, navigationIcon, onSaved, onBrowse }: ThemeEditorViewProps) {
  const navigation = useNavigation();
  const [draft, setDraft] = useState(initialDraft);
  const [saved, setSaved] = useState(initialDraft);
  const [copySource, setCopySource] = useState(copiedFrom);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [focused, setFocused] = useState<"name" | ColorKey | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = !isSameDraft(draft, saved) || !draft.id;

  const confirmDiscard = useCallback(async () => {
    if (isSameDraft(draft, saved)) return true;
    return confirmAlert({
      title: "Discard Unsaved Changes?",
      message: "Your edits to this theme haven't been saved and will be lost.",
      primaryAction: { title: "Discard Changes", style: "destructive" },
      dismissAction: { title: "Keep Editing" },
    });
  }, [draft, saved]);

  const onEscape = useCallback(() => {
    void confirmDiscard().then((discard) => discard && navigation.pop());
  }, [confirmDiscard, navigation]);

  return (
    <ViewFrame navigationTitle={navigationTitle ?? (draft.id ? "Edit Theme" : "Create Theme")} navigationIcon={navigationIcon} isLoading={saving} primaryShortcut="cmd-enter" onEscape={onEscape}>
      <EditorBody
        draft={draft}
        setDraft={setDraft}
        saved={saved}
        setSaved={setSaved}
        dirty={dirty}
        errors={errors}
        setErrors={setErrors}
        focused={focused}
        setFocused={setFocused}
        setSaving={setSaving}
        basePalette={basePalette}
        copySource={copySource}
        clearCopySource={() => setCopySource(undefined)}
        onSaved={onSaved}
        onBrowse={onBrowse}
      />
    </ViewFrame>
  );
}

interface EditorBodyProps {
  draft: ThemeDraft;
  setDraft: (update: (previous: ThemeDraft) => ThemeDraft) => void;
  saved: ThemeDraft;
  setSaved: (draft: ThemeDraft) => void;
  dirty: boolean;
  errors: DraftErrors;
  setErrors: (update: (previous: DraftErrors) => DraftErrors) => void;
  focused: "name" | ColorKey | null;
  setFocused: (key: "name" | ColorKey | null) => void;
  setSaving: (saving: boolean) => void;
  basePalette: Palette;
  copySource?: string;
  clearCopySource: () => void;
  onSaved?: (theme: Theme) => void;
  onBrowse?: () => void;
}

function EditorBody({ draft, setDraft, saved, setSaved, dirty, errors, setErrors, focused, setFocused, setSaving, basePalette, copySource, clearCopySource, onSaved, onBrowse }: EditorBodyProps) {
  const { settings } = useSettings();
  const shown = useTheme();
  const nameRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const saving = useRef(false);

  // The preview keeps the last complete color of a field while it is being typed.
  const lastPreview = useRef(basePalette);
  const preview = useMemo(() => {
    const palette = draftToPalette(draft, lastPreview.current);
    lastPreview.current = palette;
    return palette;
  }, [draft]);

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
  }, []);

  const revalidate = useCallback(
    (next: ThemeDraft, key: "name" | ColorKey) => {
      setErrors((previous) => (previous[key] ? { ...previous, [key]: validateDraft(next)[key] } : previous));
    },
    [setErrors],
  );

  const setName = (name: string) => {
    const next = { ...draft, name };
    setDraft(() => next);
    revalidate(next, "name");
  };

  const setColor = (key: ColorKey, value: string) => {
    const next = { ...draft, colors: { ...draft.colors, [key]: value } };
    setDraft(() => next);
    revalidate(next, key);
  };

  const blurColor = (key: ColorKey) => {
    setFocused(null);
    const normalized = normalizeHex(draft.colors[key]);
    if (normalized && normalized !== draft.colors[key]) setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: normalized } }));
    setErrors((previous) => ({ ...previous, [key]: validateDraft(draft)[key] }));
  };

  const focusField = (key: "name" | ColorKey) => {
    const index = FIELD_ORDER.indexOf(key);
    const inputs = fieldsRef.current?.querySelectorAll<HTMLInputElement>("input:not([type=color])");
    inputs?.[index]?.focus();
  };

  const save = async (apply: boolean) => {
    if (saving.current) return;
    const found = validateDraft(draft);
    setErrors(() => found);
    if (hasErrors(found)) {
      const first = FIELD_ORDER.find((key) => found[key]);
      if (first) focusField(first);
      showToast({ style: "failure", title: "Can't save theme", message: first === "name" ? found.name : "Some colors aren't valid hex values" });
      return;
    }
    saving.current = true;
    setSaving(true);
    const toast = showToast({ style: "animated", title: "Saving theme…" });
    try {
      const theme = await backend.call("themes.upsert", draftToUpsert(draft));
      const stored = draftFromPalette(paletteFromTheme(theme), { id: theme.id });
      setDraft(() => stored);
      setSaved(stored);
      clearCopySource();
      if (apply) {
        await applyThemeSettings(themeSettingsUpdate(theme.id, theme.appearance, "current", settings["general.appearance"], shown.appearance));
        toast.update({ style: "success", title: "Theme saved and applied" });
      } else {
        toast.update({
          style: "success",
          title: "Theme saved",
          primaryAction: { title: "Set as Current", onAction: () => applyThemeSettings(themeSettingsUpdate(theme.id, theme.appearance, "current", settings["general.appearance"], shown.appearance)) },
        });
      }
      onSaved?.(theme);
    } catch (error) {
      toast.hide();
      showFailureToast("Failed to save theme", error);
    } finally {
      saving.current = false;
      setSaving(false);
    }
  };

  const importFromClipboard = async () => {
    try {
      const text = await readClipboardText();
      const parsed = text ? parseThemeJson(text, draft.colors.accent) : null;
      if (!parsed) {
        showToast({ style: "failure", title: "No theme in the clipboard", message: "Copy a theme's JSON, then try again." });
        return;
      }
      setDraft((d) => ({ ...parsed, id: d.id }));
      setErrors(() => ({}));
      showToast({ style: "success", title: `Imported “${parsed.name}”`, message: "Review the colors and save to keep them." });
    } catch (error) {
      showFailureToast("Failed to read the clipboard", error);
    }
  };

  useRegisterActions(
    <ActionPanel title={draft.name.trim() || "Untitled"}>
      <Action title="Save Theme" icon="save-document-16" shortcut={sc("cmd", "return")} onAction={() => save(false)} />
      <Action title="Save and Set as Current" icon="check-circle-16" shortcut={sc("cmd", "shift", "return")} onAction={() => save(true)} />
      <ActionPanel.Section>
        <Action title="Revert Changes" icon="arrow-counter-clockwise-16" disabled={isSameDraft(draft, saved)} onAction={() => { setDraft(() => saved); setErrors(() => ({})); }} />
        <Action title="Copy Theme JSON" icon="copy-clipboard-16" shortcut={sc("cmd", "shift", "c")} onAction={() => copyWithToast(themeToJson(draft), "Copied theme JSON")} />
        <Action title="Import Theme from Clipboard" icon="download-16" shortcut={sc("cmd", "shift", "v")} onAction={importFromClipboard} />
      </ActionPanel.Section>
      {onBrowse && (
        <ActionPanel.Section>
          <Action title="Switch Theme…" icon="brush-16" shortcut={sc("cmd", "p")} onAction={onBrowse} />
        </ActionPanel.Section>
      )}
    </ActionPanel>,
  );

  return (
    <div className="sc-theme-editor">
      <ScrollArea className="sc-theme-editor__fields" fade={{ top: 88, bottom: 64 }} thumbInset={{ top: 64, bottom: 52 }}>
        <div ref={fieldsRef} className="sc-theme-editor__form">
          {copySource && (
            <p className="sc-theme-editor__notice">
              <Icon name="lock-16" size={12} />
              <span>“{copySource}” is built in. Saving creates a new theme.</span>
            </p>
          )}
          <div className="sc-theme-editor__group">
            <div className="sc-theme-editor__row" data-invalid={errors.name ? "" : undefined}>
              <label className="sc-theme-editor__label" htmlFor="sc-theme-name">
                Name
              </label>
              <TextField
                ref={nameRef}
                id="sc-theme-name"
                size="small"
                className="sc-theme-editor__name"
                value={draft.name}
                placeholder="Untitled"
                onChange={setName}
                onFocus={() => setFocused("name")}
                onBlur={() => {
                  setFocused(null);
                  setErrors((previous) => ({ ...previous, name: validateDraft(draft).name }));
                }}
                validation={errors.name ? "error" : undefined}
              />
              {errors.name && (
                <span className="sc-theme-editor__error" role="alert">
                  <Icon name="warning-16" size={12} />
                  {errors.name}
                </span>
              )}
            </div>
            <div className="sc-theme-editor__row">
              <span className="sc-theme-editor__label">Appearance</span>
              <SegmentedControl label="Appearance" value={draft.appearance} segments={APPEARANCES} onChange={(appearance) => setDraft((d) => ({ ...d, appearance }))} />
            </div>
          </div>
          {COLOR_GROUPS.map((group) => (
            <div key={group.title} className="sc-theme-editor__group">
              <div className="sc-theme-editor__group-title">{group.title}</div>
              {group.fields.map(({ key, label }) => (
                <ColorField
                  key={key}
                  label={label}
                  value={draft.colors[key]}
                  swatch={previewHex(draft.colors[key]) ?? preview.colors[key]}
                  error={errors[key]}
                  onChange={(value) => setColor(key, value)}
                  onFocus={() => setFocused(key)}
                  onBlur={() => blurColor(key)}
                />
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="sc-theme-editor__preview">
        <div className="sc-theme-editor__preview-title">
          <span>Preview</span>
          {dirty && <span className="sc-theme-editor__badge">{draft.id ? "Unsaved" : "New"}</span>}
        </div>
        <div className="sc-theme-editor__frame">
          <ThemeMiniLauncher palette={preview} showLoader={focused === "loader"} />
        </div>
      </div>
    </div>
  );
}
