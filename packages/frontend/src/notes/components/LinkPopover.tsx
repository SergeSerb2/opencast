import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { Popover } from "../../components/Popover/Popover";
import { showFailureToast } from "../../components/feedback/toast-store";
import { native } from "../../bridge/native";
import { Icon } from "../../icons/Icon";
import { showVirtualSelection } from "../editor/virtual-selection";
import { useNotesStore } from "../store";

/** "example.com" → "https://example.com"; keeps explicit schemes (mailto:, surgecast:, …). */
export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`;
  return `https://${trimmed}`;
}

export async function openHref(href: string): Promise<void> {
  try {
    await native.call("open.url", { url: href });
  } catch (error) {
    showFailureToast("Could not open link", error);
  }
}

interface Target {
  from: number;
  to: number;
  href: string;
  anchor: { x: number; y: number };
}

function selectionTarget(editor: Editor): Target {
  const linked = editor.isActive("link");
  if (linked) editor.chain().extendMarkRange("link").run();
  const { from, to } = editor.state.selection;
  const start = editor.view.coordsAtPos(from);
  const end = editor.view.coordsAtPos(to);
  const root = (document.getElementById("sc-overlay-root") ?? document.body).getBoundingClientRect();
  const top = Math.min(start.top, end.top);
  const x = start.top === end.top ? (start.left + end.right) / 2 : (root.left + root.right) / 2;
  return {
    from,
    to,
    href: linked ? String(editor.getAttributes("link").href ?? "") : "",
    anchor: { x: Math.min(Math.max(x - root.left, 150), root.width - 150), y: Math.max(top - root.top, 60) },
  };
}

/** Link editor (⌘L): 280px glass card above the selection with the URL field, open and remove actions. */
export function LinkPopover({ editor }: { editor: Editor }) {
  const editing = useNotesStore((state) => state.linkEditing);
  const [target, setTarget] = useState<Target | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setTarget(null);
      return;
    }
    const next = selectionTarget(editor);
    setTarget(next);
    setValue(next.href);
  }, [editing, editor]);

  // Focus the field once the popover has mounted, keeping the edited text highlighted.
  useEffect(() => {
    if (!target) return;
    showVirtualSelection(editor, target);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
      showVirtualSelection(editor, null);
    };
  }, [target, editor]);

  const close = () => {
    useNotesStore.setState({ linkEditing: false });
    editor.commands.focus();
  };

  const apply = () => {
    if (!target) return;
    const href = normalizeHref(value);
    const chain = editor.chain().focus().setTextSelection({ from: target.from, to: target.to });
    if (!href) chain.extendMarkRange("link").unsetLink().run();
    else if (target.from === target.to) chain.insertContent({ type: "text", text: value.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    else chain.extendMarkRange("link").setLink({ href }).run();
    useNotesStore.setState({ linkEditing: false });
  };

  const remove = () => {
    if (!target) return;
    editor.chain().focus().setTextSelection({ from: target.from, to: target.to }).extendMarkRange("link").unsetLink().run();
    useNotesStore.setState({ linkEditing: false });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const href = normalizeHref(value);
  return (
    <Popover open={editing && target !== null} onClose={close} anchor={target?.anchor ?? null} side="top" align="center" width={280} offset={8} aria-label="Edit Link" role="dialog">
      <div className="sc-notes-link">
        <input
          ref={inputRef}
          className="sc-notes-link__input"
          placeholder="Enter a link…"
          value={value}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <span className="sc-notes-link__divider" />
        <div className="sc-notes-link__actions">
          <button type="button" className="sc-notes-link__button" aria-label="Open Link" title="Open Link" disabled={!href} onClick={() => void openHref(href)}>
            <Icon name="arrow-ne-16" size={16} />
          </button>
          <button type="button" className="sc-notes-link__button" aria-label="Remove Link" title="Remove Link" disabled={!target?.href} onClick={remove}>
            <Icon name="trash-16" size={16} />
          </button>
        </div>
      </div>
    </Popover>
  );
}
