import { useRef, useState } from "react";
import type { ImageLike, WindowLayout } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { Action, ActionPanel, ScrollArea, showFailureToast, showToast, TextField, useNavigation, useRegisterActions, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
import { FieldError, PercentField, PositionGrid } from "./controls";
import { DEFAULT_DRAFT, draftToRect, rectToDraft, validateDraft, validateName, type DraftErrors, type DraftField, type LayoutDraft } from "./geometry";
import { IconPicker } from "./IconPicker";
import { LayoutPreview, screenLabel } from "./LayoutPreview";
import { isLayoutThumbnail, layoutThumbnail } from "./thumbnail";
import { useMainScreen } from "./useMainScreen";
import "./window-management.css";

/** Fields an existing (edit) or template (duplicate, deeplink) layout provides. */
export type LayoutTemplate = Partial<Pick<WindowLayout, "id" | "name" | "icon" | "rect">>;

export interface WindowLayoutEditorProps {
  /** With an `id` the editor updates that command; otherwise it creates one prefilled with the template. */
  layout?: LayoutTemplate;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
}

type EditorErrors = DraftErrors & { name?: string };

const FIELD_ORDER: (keyof EditorErrors)[] = ["name", "width", "height", "x", "y"];
const FIELD_IDS: Record<keyof EditorErrors, string> = { name: "sc-wm-name", width: "sc-wm-width", height: "sc-wm-height", x: "sc-wm-x", y: "sc-wm-y" };

/**
 * Custom window command editor: live display preview on the left; name and
 * icon, position grid, size and offset on the right. ⌘↵ saves.
 */
export function WindowLayoutEditor({ layout, navigationTitle, navigationIcon }: WindowLayoutEditorProps) {
  const editing = Boolean(layout?.id);
  return (
    <ViewFrame navigationTitle={navigationTitle ?? (editing ? "Edit Window Command" : "Create Window Command")} navigationIcon={navigationIcon} primaryShortcut="cmd-enter">
      <EditorBody layout={layout} editing={editing} />
    </ViewFrame>
  );
}

function EditorBody({ layout, editing }: { layout?: LayoutTemplate; editing: boolean }) {
  const navigation = useNavigation();
  const screen = useMainScreen();
  const [name, setName] = useState(layout?.name ?? "");
  const [icon, setIcon] = useState<ImageLike | undefined>(isLayoutThumbnail(layout?.icon) ? undefined : layout?.icon);
  const [draft, setDraft] = useState<LayoutDraft>(layout?.rect ? rectToDraft(layout.rect) : DEFAULT_DRAFT);
  const [errors, setErrors] = useState<EditorErrors>({});
  const saving = useRef(false);
  const rect = draftToRect(draft);

  const clearErrors = (...fields: (keyof EditorErrors)[]) =>
    setErrors((current) => {
      if (!fields.some((f) => current[f])) return current;
      const next = { ...current };
      for (const f of fields) delete next[f];
      return next;
    });

  const update = (patch: Partial<LayoutDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    // Offset ranges depend on position and size, so any geometry change can resolve them.
    clearErrors(...Object.keys(patch).filter((key): key is DraftField => key !== "position"), "x", "y");
  };

  const save = async () => {
    if (saving.current) return;
    const nameError = validateName(name);
    const result = validateDraft(draft);
    const next: EditorErrors = { ...result.errors, ...(nameError ? { name: nameError } : {}) };
    setErrors(next);
    if (nameError || !result.rect) {
      const first = FIELD_ORDER.find((f) => next[f]);
      if (first) document.getElementById(FIELD_IDS[first])?.focus();
      showToast({ style: "failure", title: "Check the highlighted fields" });
      return;
    }
    saving.current = true;
    try {
      const saved = await backend.call("windows.layouts.upsert", {
        ...(layout?.id ? { id: layout.id } : {}),
        name: name.trim(),
        icon: icon ?? layoutThumbnail(result.rect),
        rect: result.rect,
      });
      showToast({ style: "success", title: editing ? "Window command saved" : "Window command created", message: saved.name });
      navigation.pop();
    } catch (error) {
      showFailureToast(editing ? "Could not save the window command" : "Could not create the window command", error);
    } finally {
      saving.current = false;
    }
  };

  useRegisterActions(
    <ActionPanel>
      <Action title={editing ? "Save Window Command" : "Create Window Command"} icon="checkmark-16" onAction={save} />
      <Action
        title="Reset Geometry"
        icon="arrow-counter-clockwise-16"
        shortcut={sc("cmd", "shift", "r")}
        onAction={() => {
          setDraft(layout?.rect ? rectToDraft(layout.rect) : DEFAULT_DRAFT);
          clearErrors("width", "height", "x", "y");
        }}
      />
    </ActionPanel>,
  );

  return (
    <div className="sc-wm-editor">
      <ScrollArea fade={{ top: 72, bottom: 64 }} thumbInset={{ top: 64, bottom: 52 }}>
        <div className="sc-wm-editor__columns">
          <section className="sc-wm-editor__column" aria-label="Preview">
            <span className="sc-wm-editor__label">Preview</span>
            <LayoutPreview rect={rect} screen={screen} label={screenLabel(screen)} />
            <p className="sc-wm-editor__hint">Size and offset are percentages of the screen area between the menu bar and the Dock. Offsets move the window right and down from the chosen position.</p>
          </section>
          <section className="sc-wm-editor__column" aria-label="Command">
            <div className="sc-wm-editor__group">
              <label className="sc-wm-editor__label" htmlFor={FIELD_IDS.name}>
                Name &amp; Icon
              </label>
              <TextField
                id={FIELD_IDS.name}
                value={name}
                onChange={(value) => {
                  setName(value);
                  clearErrors("name");
                }}
                placeholder="Window command name"
                validation={errors.name ? "error" : undefined}
                aria-invalid={errors.name ? true : undefined}
                autoFocus
                accessory={<IconPicker icon={icon} rect={rect} onChange={setIcon} />}
              />
              <FieldError message={errors.name} />
            </div>
            <div className="sc-wm-editor__split">
              <div className="sc-wm-editor__group">
                <span className="sc-wm-editor__label" id="sc-wm-position-label">
                  Position
                </span>
                <PositionGrid value={draft.position} onChange={(position) => update({ position })} labelledBy="sc-wm-position-label" />
              </div>
              <div className="sc-wm-editor__group">
                <span className="sc-wm-editor__label">Size</span>
                <PercentField id={FIELD_IDS.width} label="W" ariaLabel="Width in percent" value={draft.width} onChange={(width) => update({ width })} placeholder="100" error={errors.width} min={1} max={100} />
                <PercentField id={FIELD_IDS.height} label="H" ariaLabel="Height in percent" value={draft.height} onChange={(height) => update({ height })} placeholder="100" error={errors.height} min={1} max={100} />
              </div>
            </div>
            <div className="sc-wm-editor__group">
              <span className="sc-wm-editor__label">Offset</span>
              <div className="sc-wm-editor__row">
                <PercentField id={FIELD_IDS.x} label="X" ariaLabel="Horizontal offset in percent" value={draft.x} onChange={(x) => update({ x })} placeholder="0" error={errors.x} min={-100} max={100} />
                <PercentField id={FIELD_IDS.y} label="Y" ariaLabel="Vertical offset in percent" value={draft.y} onChange={(y) => update({ y })} placeholder="0" error={errors.y} min={-100} max={100} />
              </div>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}
