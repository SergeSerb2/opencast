import { forwardRef, memo, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import type { AIChat, AIChatFolder } from "@opencast/protocol";
import { Spinner } from "../../components/Spinner/Spinner";
import { Icon } from "../../icons/Icon";
import type { SidebarGroups } from "../model/chat-groups";
import "./sidebar.css";

export interface SidebarProps {
  groups: SidebarGroups;
  /** Search results (flat) while a query is entered. */
  results: AIChat[] | null;
  query: string;
  onQueryChange: (query: string) => void;
  selectedId: string | null;
  /** The unsaved new chat is selected: show it at the top of Recent. */
  draftActive: boolean;
  generatingIds: ReadonlySet<string>;
  renamingId: string | null;
  onRenamingChange: (id: string | null) => void;
  onSelect: (chat: AIChat) => void;
  onSelectDraft: () => void;
  onRename: (chat: AIChat, title: string) => void;
  onRenameFolder: (folder: AIChatFolder, name: string) => void;
  onChatContextMenu: (chat: AIChat, event: MouseEvent) => void;
  onFolderContextMenu: (folder: AIChatFolder, event: MouseEvent) => void;
  onSearchKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

const COLLAPSED_KEY = "opencast.ai.collapsedSections";

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(globalThis.localStorage?.getItem(COLLAPSED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Single-line title that fades out at the right edge when it overflows. */
function RowTitle({ text }: { text: string }) {
  return <span className="sc-ai-row__title">{text}</span>;
}

function RenameField({ initial, onDone }: { initial: string; onDone: (value: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const commit = () => onDone(value.trim() && value.trim() !== initial ? value.trim() : null);
  return (
    <span className="sc-ai-row__rename">
      <input
        ref={input}
        value={value}
        aria-label="Name"
        onChange={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") onDone(null);
        }}
      />
      <button type="button" className="sc-ai-row__rename-button" aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => onDone(null)}>
        <Icon name="xmark-16" size={10} />
      </button>
      <button type="button" className="sc-ai-row__rename-button" data-confirm aria-label="Save" onMouseDown={(e) => e.preventDefault()} onClick={commit}>
        <Icon name="checkmark-16" size={10} />
      </button>
    </span>
  );
}

interface ChatRowProps {
  chat: AIChat;
  selected: boolean;
  generating: boolean;
  renaming: boolean;
  onSelect: (chat: AIChat) => void;
  onRename: (chat: AIChat, title: string) => void;
  onRenamingChange: (id: string | null) => void;
  onContextMenu: (chat: AIChat, event: MouseEvent) => void;
}

const ChatRow = memo(function ChatRow({ chat, selected, generating, renaming, onSelect, onRename, onRenamingChange, onContextMenu }: ChatRowProps) {
  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      data-chat-id={chat.id}
      className="sc-ai-row"
      data-selected={selected || undefined}
      onClick={() => !renaming && onSelect(chat)}
      onDoubleClick={() => onRenamingChange(chat.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(chat, e);
      }}
    >
      {renaming ? (
        <RenameField
          initial={chat.title}
          onDone={(title) => {
            onRenamingChange(null);
            if (title) onRename(chat, title);
          }}
        />
      ) : (
        <>
          <RowTitle text={chat.title} />
          {generating && (
            <span className="sc-ai-row__status">
              <Spinner size={14} label="Generating" />
            </span>
          )}
        </>
      )}
    </div>
  );
});

function SectionHeader({ icon, title, collapsible, collapsed, onToggle, onContextMenu, children }: { icon: string; title: string; collapsible?: boolean; collapsed?: boolean; onToggle?: () => void; onContextMenu?: (event: MouseEvent) => void; children?: ReactNode }) {
  return (
    <div
      className="sc-ai-section-header"
      role={collapsible || onToggle ? "button" : undefined}
      aria-expanded={collapsible ? !collapsed : undefined}
      data-collapsible={collapsible || undefined}
      data-collapsed={collapsed || undefined}
      onClick={onToggle}
      onContextMenu={onContextMenu}
    >
      <span className="sc-ai-section-header__icon">
        <Icon name={icon} size={16} />
        {collapsible && <Icon name="chevron-down-small-16" size={16} className="sc-ai-section-header__chevron" />}
      </span>
      {children ?? <span className="sc-truncate">{title}</span>}
    </div>
  );
}

/**
 * Chat history: “Search chats”, pinned chats, folders, recent chats grouped by
 * time, and the archive (§6.2). Folder and section collapse state is per device.
 */
export const Sidebar = forwardRef<HTMLInputElement, SidebarProps>(function Sidebar(props, searchRef) {
  const { groups, results, query, onQueryChange, selectedId, draftActive, generatingIds, renamingId, onRenamingChange, onSelect, onSelectDraft, onRename, onRenameFolder, onChatContextMenu, onFolderContextMenu, onSearchKeyDown } = props;
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Collapse state is a convenience; ignore storage failures.
    }
  }, [collapsed]);

  useEffect(() => {
    if (selectedId) list.current?.querySelector(`[data-chat-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const row = (chat: AIChat) => (
    <ChatRow
      key={chat.id}
      chat={chat}
      selected={chat.id === selectedId}
      generating={generatingIds.has(chat.id)}
      renaming={chat.id === renamingId}
      onSelect={onSelect}
      onRename={onRename}
      onRenamingChange={onRenamingChange}
      onContextMenu={onChatContextMenu}
    />
  );

  const draftRow = draftActive && (
    <div role="option" aria-selected className="sc-ai-row" data-selected onClick={onSelectDraft}>
      <RowTitle text="New Chat" />
    </div>
  );

  return (
    <nav className="sc-ai-sidebar" aria-label="Chats">
      <div className="sc-ai-sidebar__search sc-glass-control">
        <Icon name="magnifying-glass-16" size={16} className="sc-ai-sidebar__search-icon" />
        <input ref={searchRef} value={query} placeholder="Search chats" aria-label="Search chats" spellCheck={false} onChange={(e) => onQueryChange(e.currentTarget.value)} onKeyDown={onSearchKeyDown} />
        {query && (
          <button type="button" className="sc-ai-sidebar__clear" aria-label="Clear search" onClick={() => onQueryChange("")}>
            <Icon name="xmark-16" size={12} />
          </button>
        )}
      </div>
      <div ref={list} className="sc-ai-sidebar__list sc-no-scrollbar" role="listbox" aria-label="Chats">
        {results ? (
          results.length ? (
            <div className="sc-ai-section">{results.map(row)}</div>
          ) : (
            <div className="sc-ai-sidebar__empty">No Results</div>
          )
        ) : (
          <>
            {groups.pinned.length > 0 && (
              <div className="sc-ai-section">
                <SectionHeader icon="pin-16" title="Pinned" collapsible collapsed={collapsed.has("pinned")} onToggle={() => toggle("pinned")} />
                {!collapsed.has("pinned") && groups.pinned.map(row)}
              </div>
            )}
            {groups.folders.map(({ folder, chats }) => {
              const key = `folder:${folder.id}`;
              const renaming = renamingId === key;
              return (
                <div key={folder.id} className="sc-ai-section">
                  <SectionHeader
                    icon="folder-16"
                    title={folder.name}
                    collapsible={!renaming}
                    collapsed={collapsed.has(key)}
                    onToggle={renaming ? undefined : () => toggle(key)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onFolderContextMenu(folder, e);
                    }}
                  >
                    {renaming ? (
                      <RenameField
                        initial={folder.name}
                        onDone={(name) => {
                          onRenamingChange(null);
                          if (name) onRenameFolder(folder, name);
                        }}
                      />
                    ) : undefined}
                  </SectionHeader>
                  {!collapsed.has(key) && (chats.length ? chats.map(row) : <div className="sc-ai-sidebar__hint">No chats</div>)}
                </div>
              );
            })}
            <div className="sc-ai-section">
              <SectionHeader icon="speech-bubble-round-16" title="Recent" />
              {draftRow}
              {groups.recent.map((group) => (
                <div key={group.label ?? "today"} role="group" aria-label={group.label ?? "Today"}>
                  {group.label && <div className="sc-ai-time-label">{group.label}</div>}
                  {group.chats.map(row)}
                </div>
              ))}
              {!draftRow && groups.recent.length === 0 && groups.pinned.length === 0 && <div className="sc-ai-sidebar__hint">No chats yet</div>}
            </div>
            <div className="sc-ai-section">
              <SectionHeader icon="archive-16" title="Archive" collapsible collapsed={!archiveOpen} onToggle={() => setArchiveOpen((open) => !open)} />
              {archiveOpen && (groups.archived.length ? groups.archived.map(row) : <div className="sc-ai-sidebar__hint">No archived chats</div>)}
            </div>
          </>
        )}
      </div>
    </nav>
  );
});
