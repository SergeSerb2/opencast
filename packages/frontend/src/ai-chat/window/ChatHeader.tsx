import { useLayoutEffect, useRef, useState } from "react";
import { IconButton } from "../../components/Button/Button";
import { Icon } from "../../icons/Icon";

export interface ChatHeaderProps {
  title: string;
  isNew: boolean;
  modelLabel: string;
  presetName?: string;
  canRename: boolean;
  onRename: (title: string) => void;
  onOpenModels: (anchor: HTMLElement) => void;
  onOpenActions: (anchor: HTMLElement) => void;
  onToggleSettings: () => void;
  settingsOpen: boolean;
  actionsOpen: boolean;
}

function TitleEditor({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => input.current?.select(), []);
  const commit = () => onDone(value.trim() && value.trim() !== initial ? value.trim() : null);
  return (
    <input
      ref={input}
      className="sc-ai-header__title-input"
      value={value}
      aria-label="Chat title"
      onChange={(e) => setValue(e.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone(null);
      }}
    />
  );
}

/** Title + model metadata on the left of the chat column, action and settings buttons on the right (§6.3). */
export function ChatHeader({ title, isNew, modelLabel, presetName, canRename, onRename, onOpenModels, onOpenActions, onToggleSettings, settingsOpen, actionsOpen }: ChatHeaderProps) {
  const [editing, setEditing] = useState(false);
  return (
    <header className="sc-ai-header">
      <div className="sc-ai-header__titles">
        {editing ? (
          <TitleEditor
            initial={title}
            onDone={(next) => {
              setEditing(false);
              if (next) onRename(next);
            }}
          />
        ) : (
          <div className="sc-ai-header__title sc-truncate" data-new={isNew || undefined} title={canRename ? "Double-click to rename" : undefined} onDoubleClick={() => canRename && setEditing(true)}>
            {title}
          </div>
        )}
        <div className="sc-ai-header__meta">
          <button type="button" className="sc-ai-header__meta-button" title="Change Model (⌘⇧M)" onClick={(e) => onOpenModels(e.currentTarget)}>
            <span className="sc-truncate">{modelLabel}</span>
          </button>
          {presetName && (
            <span className="sc-ai-header__preset sc-truncate">
              <Icon name="speech-bubble-16" size={12} />
              {presetName}
            </span>
          )}
        </div>
      </div>
      <div className="sc-ai-glass-group sc-glass-control">
        <IconButton icon="command-symbol-16" iconSize={18} size={28} label="Actions (⌘K)" data-state={actionsOpen ? "open" : undefined} onClick={(e) => onOpenActions(e.currentTarget)} />
        <IconButton icon="settings-slider-16" iconSize={18} size={28} label="Chat Settings" data-state={settingsOpen ? "open" : undefined} aria-pressed={settingsOpen} onClick={onToggleSettings} />
      </div>
    </header>
  );
}
