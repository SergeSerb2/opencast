import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { IconButton, Menu, Popover, type MenuSection } from "../../../components";
import { caretOffset } from "../ai-shared/caret";
import { TextEditor, type HighlightSegment } from "../ai-shared/TextEditor";
import { insertPlaceholder, placeholderKey, PROMPT_PLACEHOLDERS, tokenizePrompt, typedPlaceholderTrigger, type PlaceholderOption } from "./placeholders";

export interface PromptEditorHandle {
  /** Open the placeholder menu at the caret (replacing the selection on insert). */
  openPlaceholderMenu: () => void;
  /** Insert at the last caret position (used by the action panel). */
  insert: (option: PlaceholderOption) => void;
}

interface PromptEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  "aria-labelledby"?: string;
}

interface MenuState {
  /** Range the inserted placeholder replaces: the typed `{`, or the selection. */
  start: number;
  end: number;
}

const MENU_SECTIONS: MenuSection[] = ["Input", "Browser", "Context", "Date & Time"].map((title) => ({
  id: title,
  title,
  items: PROMPT_PLACEHOLDERS.filter((p) => p.section === title).map((p) => ({ id: p.id, title: p.title, icon: p.icon, accessoryText: placeholderKey(p), keywords: [p.id, ...(p.keywords ?? [])] })),
}));

const highlightPrompt = (text: string): HighlightSegment[] =>
  tokenizePrompt(text).map((segment) => (segment.kind === "placeholder" ? { text: segment.text, className: segment.invalid ? "sc-ai-placeholder sc-ai-placeholder--invalid" : "sc-ai-placeholder" } : { text: segment.text }));

/**
 * Prompt field with highlighted placeholders. Typing `{` (or the toolbar
 * button) opens a searchable menu of the placeholders the backend expands.
 */
export const PromptEditor = forwardRef<PromptEditorHandle, PromptEditorProps>(function PromptEditor({ id, value, onChange, invalid, ...aria }, ref) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [anchor, setAnchor] = useState({ left: 0, top: 0, height: 0 });
  const options = useMemo(() => new Map(PROMPT_PLACEHOLDERS.map((p) => [p.id, p])), []);

  const openMenu = (range: MenuState, caret: number) => {
    const textarea = textareaRef.current;
    const wrapper = wrapperRef.current;
    if (!textarea || !wrapper) return;
    const offset = caretOffset(textarea, caret);
    const box = textarea.getBoundingClientRect();
    const origin = wrapper.getBoundingClientRect();
    setAnchor({ left: box.left - origin.left + offset.left, top: box.top - origin.top + offset.top, height: offset.height });
    setMenu(range);
  };

  /** The textarea keeps its selection while the menu or the action panel has focus. */
  const currentRange = (): MenuState => {
    const textarea = textareaRef.current;
    return textarea ? { start: textarea.selectionStart, end: textarea.selectionEnd } : { start: value.length, end: value.length };
  };

  const focusAt = (caret: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
      textareaRef.current?.setSelectionRange(caret, caret);
    });
  };

  const insert = (option: PlaceholderOption, range: MenuState = currentRange()) => {
    const edit = insertPlaceholder(value, range.start, range.end, option);
    onChange(edit.text);
    setMenu(null);
    focusAt(edit.caret);
  };

  const openAtSelection = () => {
    const range = currentRange();
    openMenu(range, range.end);
  };

  useImperativeHandle(ref, () => ({ openPlaceholderMenu: openAtSelection, insert: (option) => insert(option) }));

  return (
    <div ref={wrapperRef} className="sc-ai-prompt">
      <TextEditor
        ref={textareaRef}
        id={id}
        value={value}
        invalid={invalid}
        placeholder="Write the instructions for this AI command…"
        highlight={highlightPrompt}
        onChange={(next, caret) => {
          const trigger = typedPlaceholderTrigger(value, next, caret);
          onChange(next);
          if (trigger !== null) openMenu({ start: trigger, end: trigger + 1 }, caret);
        }}
        toolbar={<IconButton icon="text-input-16" label="Insert Placeholder" variant="tertiary" size={24} iconSize={16} onMouseDown={(e) => e.preventDefault()} onClick={openAtSelection} />}
        {...aria}
      />
      <span ref={anchorRef} className="sc-ai-prompt__caret" style={{ left: anchor.left, top: anchor.top, height: anchor.height }} aria-hidden="true" />
      <Popover open={menu !== null} onClose={() => setMenu(null)} anchor={anchorRef.current} side="bottom" align="start" offset={4} width={320} role="dialog" aria-label="Insert Placeholder">
        {({ side }) => (
          <Menu
            sections={MENU_SECTIONS}
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Search placeholders…"
            maxHeight={248}
            onSelect={(item) => {
              const option = options.get(item.id);
              if (option && menu) insert(option, menu);
            }}
            onDismiss={() => {
              setMenu(null);
              focusAt(menu?.end ?? currentRange().end);
            }}
          />
        )}
      </Popover>
    </div>
  );
});
