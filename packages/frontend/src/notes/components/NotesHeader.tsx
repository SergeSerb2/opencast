import { forwardRef, type MouseEvent } from "react";
import type { KeyboardShortcut } from "@opencast/protocol";
import { getEnv } from "../../bridge/env";
import { native } from "../../bridge/native";
import { Shortcut } from "../../components/Keycap/Keycap";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { Icon } from "../../icons/Icon";
import { NOTES_SHORTCUTS as S } from "../lib/shortcuts";

interface HeaderButtonProps {
  icon: string;
  label: string;
  shortcut: KeyboardShortcut;
  active?: boolean;
  onClick: () => void;
}

const HeaderButton = forwardRef<HTMLButtonElement, HeaderButtonProps>(function HeaderButton({ icon, label, shortcut, active, onClick }, ref) {
  return (
    <Tooltip
      side="bottom"
      content={
        <span className="sc-notes-tooltip">
          {label}
          <Shortcut shortcut={shortcut} />
        </span>
      }
    >
      <button ref={ref} type="button" className="sc-notes-header__button" data-state={active ? "open" : undefined} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
        <Icon name={icon} size={20} />
      </button>
    </Tooltip>
  );
});

export interface NotesHeaderProps {
  title: string;
  actionsOpen: boolean;
  browseOpen: boolean;
  onActions: () => void;
  onBrowse: () => void;
  onCreate: () => void;
}

/** Drag the native window from empty header space (WKWebView covers the title bar). */
function startDrag(event: MouseEvent<HTMLDivElement>): void {
  if (event.button !== 0 || !getEnv().native) return;
  if ((event.target as HTMLElement).closest("button")) return;
  void native.call("window.startDrag", { kind: "notes" }).catch(() => undefined);
}

/**
 * Overlay title bar (§7.2): centered note title and the glass group with
 * Actions, Browse Notes and Create Note. The left spacer mirrors the group so
 * the title stays centered; native traffic lights sit in that space.
 */
export function NotesHeader({ title, actionsOpen, browseOpen, onActions, onBrowse, onCreate }: NotesHeaderProps) {
  return (
    <div className="sc-notes-header">
      <div className="sc-notes-header__inner" onMouseDown={startDrag}>
        <div className="sc-notes-header__spacer" />
        <div className="sc-notes-header__title" title={title}>
          <span className="sc-truncate">{title}</span>
        </div>
        <div className="sc-notes-header__actions sc-glass-control">
          <HeaderButton icon="command-symbol-20" label="Actions" shortcut={S.actions} active={actionsOpen} onClick={onActions} />
          <HeaderButton icon="docs-stacked-20" label="Browse Notes" shortcut={S.browse} active={browseOpen} onClick={onBrowse} />
          <HeaderButton icon="plus-16" label="Create Note" shortcut={S.newNote} onClick={onCreate} />
        </div>
      </div>
    </div>
  );
}
