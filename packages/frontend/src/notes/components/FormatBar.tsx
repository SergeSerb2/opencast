import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import type { KeyboardShortcut } from "@surgecast/protocol";
import { Menu, type MenuItem } from "../../components/Menu/Menu";
import { Popover } from "../../components/Popover/Popover";
import { Shortcut } from "../../components/Keycap/Keycap";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { Icon } from "../../icons/Icon";
import { useEditorSelector } from "../hooks/useEditorSelector";
import { NOTES_SHORTCUTS as S } from "../lib/shortcuts";
import { useNotesStore } from "../store";

type MarkName = "bold" | "italic" | "strike" | "underline";
type ListName = "orderedList" | "bulletList" | "taskList";

export const HEADINGS = [
  { level: 1, title: "Heading 1", shortcut: S.heading1 },
  { level: 2, title: "Heading 2", shortcut: S.heading2 },
  { level: 3, title: "Heading 3", shortcut: S.heading3 },
] as const;

export const INLINE_FORMATS: { mark: MarkName; title: string; icon: string; shortcut: KeyboardShortcut }[] = [
  { mark: "bold", title: "Bold", icon: "bold-16", shortcut: S.bold },
  { mark: "italic", title: "Italic", icon: "italics-16", shortcut: S.italic },
  { mark: "strike", title: "Strikethrough", icon: "strike-through-16", shortcut: S.strike },
  { mark: "underline", title: "Underline", icon: "underline-16", shortcut: S.underline },
];

export const LISTS: { list: ListName; title: string; icon: string; shortcut: KeyboardShortcut; keywords?: string[] }[] = [
  { list: "orderedList", title: "Ordered List", icon: "number-list-16", shortcut: S.orderedList },
  { list: "bulletList", title: "Bullet List", icon: "bullet-points-16", shortcut: S.bulletList },
  { list: "taskList", title: "Task List", icon: "check-list-16", shortcut: S.taskList, keywords: ["todo", "check"] },
];

export function toggleInline(editor: Editor, mark: MarkName): void {
  const chain = editor.chain().focus();
  if (mark === "bold") chain.toggleBold().run();
  else if (mark === "italic") chain.toggleItalic().run();
  else if (mark === "strike") chain.toggleStrike().run();
  else chain.toggleUnderline().run();
}

export function toggleList(editor: Editor, list: ListName): void {
  const chain = editor.chain().focus();
  if (list === "orderedList") chain.toggleOrderedList().run();
  else if (list === "bulletList") chain.toggleBulletList().run();
  else chain.toggleTaskList().run();
}

interface FormatState {
  heading: number;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  underline: boolean;
  link: boolean;
  code: boolean;
  codeBlock: boolean;
  blockquote: boolean;
  list: ListName | null;
}

const IDLE: FormatState = { heading: 0, bold: false, italic: false, strike: false, underline: false, link: false, code: false, codeBlock: false, blockquote: false, list: null };

function selectFormat(editor: Editor): FormatState {
  const list = LISTS.find((entry) => editor.isActive(entry.list))?.list ?? null;
  return {
    heading: HEADINGS.find((entry) => editor.isActive("heading", { level: entry.level }))?.level ?? 0,
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    strike: editor.isActive("strike"),
    underline: editor.isActive("underline"),
    link: editor.isActive("link"),
    code: editor.isActive("code"),
    codeBlock: editor.isActive("codeBlock"),
    blockquote: editor.isActive("blockquote"),
    list,
  };
}

function TipLabel({ title, shortcut }: { title: string; shortcut?: KeyboardShortcut }) {
  return (
    <span className="sc-notes-tooltip">
      {title}
      {shortcut && <Shortcut shortcut={shortcut} />}
    </span>
  );
}

function ToggleButton({ icon, title, shortcut, active, onClick }: { icon: string; title: string; shortcut?: KeyboardShortcut; active: boolean; onClick: () => void }) {
  return (
    <Tooltip content={<TipLabel title={title} shortcut={shortcut} />}>
      <button
        type="button"
        className="sc-notes-format__button"
        data-active={active || undefined}
        aria-label={title}
        aria-pressed={active}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClick}
      >
        <Icon name={icon} size={16} />
      </button>
    </Tooltip>
  );
}

function MenuButton({ icon, title, active, items, onSelect, editor }: { icon: string; title: string; active: boolean; items: MenuItem[]; onSelect: (id: string) => void; editor: Editor }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(".sc-menu")?.focus());
  }, [open]);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) editor.commands.focus();
  };
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="sc-notes-format__button sc-notes-format__menu-button"
        data-active={active || undefined}
        data-state={open ? "open" : "closed"}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} size={16} />
        <Icon name="chevron-down-16" size={12} />
      </button>
      <Popover open={open} onClose={() => close(true)} anchor={buttonRef.current} side="top" align="start" alignOffset={-12} offset={8} width={240} flip={false} aria-label={title} role="dialog">
        <div ref={menuRef}>
          <Menu
            sections={[{ items }]}
            showSearch={false}
            onSelect={(item) => {
              setOpen(false);
              onSelect(item.id);
            }}
            onDismiss={() => close(true)}
            aria-label={title}
          />
        </div>
      </Popover>
    </>
  );
}

function Divider(): ReactNode {
  return <span className="sc-notes-format__divider" role="separator" />;
}

/** The floating formatting pill that replaces the counter (§7.2 formatting mode). */
export function FormatBar({ editor }: { editor: Editor }) {
  const state = useEditorSelector(editor, selectFormat, IDLE);
  const listIcon = LISTS.find((entry) => entry.list === state.list)?.icon ?? "bullet-points-16";
  return (
    <div className="sc-notes-format sc-glass-control" role="toolbar" aria-label="Formatting">
      <MenuButton
        editor={editor}
        icon="heading-16"
        title="Heading"
        active={state.heading > 0}
        items={HEADINGS.map((entry) => ({ id: String(entry.level), title: entry.title, icon: "heading-16", shortcut: entry.shortcut, checked: state.heading === entry.level }))}
        onSelect={(id) =>
          editor
            .chain()
            .focus()
            .toggleHeading({ level: Number(id) as 1 | 2 | 3 })
            .run()
        }
      />
      <MenuButton
        editor={editor}
        icon="text-cursor-16"
        title="Format"
        active={state.bold || state.italic || state.strike || state.underline}
        items={INLINE_FORMATS.map((entry) => ({ id: entry.mark, title: entry.title, icon: entry.icon, shortcut: entry.shortcut, checked: state[entry.mark] }))}
        onSelect={(id) => toggleInline(editor, id as MarkName)}
      />
      <ToggleButton icon="link-16" title="Link" shortcut={S.link} active={state.link} onClick={() => useNotesStore.setState({ linkEditing: true })} />
      <ToggleButton icon="code-16" title="Code" shortcut={S.code} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()} />
      <Divider />
      <ToggleButton icon="code-block-16" title="Code Block" shortcut={S.codeBlock} active={state.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()} />
      <ToggleButton icon="quote-block-16" title="Blockquote" shortcut={S.blockquote} active={state.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <Divider />
      <MenuButton
        editor={editor}
        icon={listIcon}
        title="List"
        active={state.list !== null}
        items={LISTS.map((entry) => ({ id: entry.list, title: entry.title, icon: entry.icon, shortcut: entry.shortcut, keywords: entry.keywords, checked: state.list === entry.list }))}
        onSelect={(id) => toggleList(editor, id as ListName)}
      />
    </div>
  );
}
