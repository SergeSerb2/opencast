import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { NoteSummary } from "@surgecast/protocol";
import { useBackend } from "../../bridge/hooks";
import { backend } from "../../bridge/backend";
import { useSetting } from "../../bridge/settings";
import { ActionPanelPopover } from "../../components/ActionPanel/ActionPanelPopover";
import type { ActionModel, ActionPanelModel } from "../../components/actions/model";
import { Popover } from "../../components/Popover/Popover";
import { Spinner } from "../../components/Spinner/Spinner";
import { Tooltip } from "../../components/Tooltip/Tooltip";
import { VirtualList, type VirtualListHandle } from "../../components/ScrollArea/VirtualList";
import { showFailureToast } from "../../components/feedback/toast-store";
import { Icon } from "../../icons/Icon";
import { matchesShortcut, navigationIntent, sc } from "../../lib/keyboard";
import type { NotesController } from "../controller";
import { FORMAT_LABEL, copyNoteAs, exportNoteAs, type NoteFormat } from "../lib/note-formats";
import { NOTES_SHORTCUTS as S } from "../lib/shortcuts";
import { plainTitle, pluralize, timeAgo } from "../lib/text";
import { closePanel, useNotesStore } from "../store";

const ROW_HEIGHT = 58;
const HEADER_HEIGHT = 32;
const FIRST_HEADER_HEIGHT = 24;
const LIST_PADDING = 8;
const SEARCH_HEIGHT = 40;
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 420;
const PANEL_TOP = 100;

type Row = { kind: "header"; title: string } | { kind: "note"; note: NoteSummary };

function buildRows(notes: NoteSummary[]): Row[] {
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const rows: Row[] = [];
  if (pinned.length) rows.push({ kind: "header", title: "Pinned" }, ...pinned.map((note) => ({ kind: "note" as const, note })));
  if (others.length) rows.push({ kind: "header", title: "Notes" }, ...others.map((note) => ({ kind: "note" as const, note })));
  return rows;
}

async function exportMarkdown(id: string): Promise<string> {
  return (await backend.call("notes.export", { id, format: "markdown" })).content;
}

/** Browse Notes (⌘P): searchable list anchored under the header, Pinned before Notes (§7.6). */
export function BrowseNotes({ controller }: { controller: NotesController }) {
  const open = useNotesStore((state) => state.panel?.kind === "browse");
  return open ? <BrowsePanel controller={controller} /> : null;
}

function BrowsePanel({ controller }: { controller: NotesController }) {
  const currentId = useNotesStore((state) => state.note?.id ?? null);
  const liveCharacters = useNotesStore((state) => state.characters);
  const bindings = useSetting("keyboard.navigationBindings");
  const [query, setQuery] = useState("");
  const { data, isLoading } = useBackend("notes.list", { query: query.trim() || undefined }, [query], { keepPreviousData: true });
  const rows = useMemo(() => buildRows(data ?? []), [data]);
  const heights = useMemo(() => rows.map((row, index) => (row.kind === "note" ? ROW_HEIGHT : index === 0 ? FIRST_HEADER_HEIGHT : HEADER_HEIGHT)), [rows]);
  const selectable = useMemo(() => rows.flatMap((row, index) => (row.kind === "note" ? [index] : [])), [rows]);
  const [selectedId, setSelectedId] = useState<string | null>(currentId);
  const [actionsOpen, setActionsOpen] = useState(false);
  const listRef = useRef<VirtualListHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIndex = rows.findIndex((row) => row.kind === "note" && row.note.id === selectedId);
  const effectiveIndex = selectedIndex >= 0 ? selectedIndex : (selectable[0] ?? -1);
  const selected = effectiveIndex >= 0 && rows[effectiveIndex].kind === "note" ? (rows[effectiveIndex] as { note: NoteSummary }).note : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    if (effectiveIndex >= 0) listRef.current?.scrollToIndex(effectiveIndex);
  }, [effectiveIndex]);

  const rootHeight = document.getElementById("sc-overlay-root")?.getBoundingClientRect().height ?? 500;
  const maxHeight = Math.max(160, Math.min(PANEL_MAX_HEIGHT, rootHeight - PANEL_TOP - 8));
  const contentHeight = heights.reduce((sum, height) => sum + height, 0) + LIST_PADDING * 2;
  const listHeight = Math.min(Math.max(contentHeight, ROW_HEIGHT + LIST_PADDING * 2), maxHeight - SEARCH_HEIGHT);

  const close = (refocus = true) => {
    closePanel();
    if (refocus) controller.focus();
  };
  const openNote = (note: NoteSummary) => {
    close(false);
    void controller.open(note.id);
  };
  const move = (delta: number) => {
    if (!selectable.length) return;
    const position = selectable.indexOf(effectiveIndex);
    const next = selectable[Math.min(selectable.length - 1, Math.max(0, (position === -1 ? 0 : position) + delta))];
    const row = rows[next];
    if (row.kind === "note") setSelectedId(row.note.id);
  };
  const remove = async (note: NoteSummary) => {
    const index = selectable.indexOf(effectiveIndex);
    const neighbour = rows[selectable[index + 1] ?? selectable[index - 1]];
    await controller.deleteNote(note.id, plainTitle(note.title));
    setSelectedId(neighbour?.kind === "note" ? neighbour.note.id : null);
    inputRef.current?.focus();
  };
  const withMarkdown = (note: NoteSummary, fn: (markdown: string) => Promise<void>) => async () => {
    try {
      await fn(note.id === currentId ? controller.currentMarkdown() : await exportMarkdown(note.id));
    } catch (error) {
      showFailureToast("Could not read note", error);
    }
  };

  const actionModel = (note: NoteSummary): ActionPanelModel => {
    const formats: NoteFormat[] = ["markdown", "text"];
    return {
      title: plainTitle(note.title),
      sections: [
        {
          actions: [
            { id: "open", title: "Open Note", icon: "blank-document-16", shortcut: sc("return"), onAction: () => openNote(note) },
            {
              id: "pin",
              title: note.pinned ? "Unpin Note" : "Pin Note",
              icon: note.pinned ? "tack-disabled-16" : "tack-16",
              shortcut: S.togglePin,
              onAction: () => controller.togglePin(note.id, Boolean(note.pinned)),
            },
            {
              id: "duplicate",
              title: "Duplicate Note",
              icon: "duplicate-16",
              shortcut: S.duplicate,
              onAction: () => {
                close(false);
                return controller.duplicate(note.id);
              },
            },
            {
              id: "new",
              title: "New Note",
              icon: "plus-16",
              shortcut: S.newNote,
              onAction: () => {
                close(false);
                return controller.newNote();
              },
            },
          ],
        },
        {
          actions: [
            ...formats.map((format) => ({ id: `copy-${format}`, title: `Copy as ${FORMAT_LABEL[format]}`, icon: "copy-clipboard-16", onAction: withMarkdown(note, (md) => copyNoteAs(md, format)) })),
            ...formats.map((format) => ({
              id: `export-${format}`,
              title: `Export as ${FORMAT_LABEL[format]}…`,
              icon: "upload-16",
              onAction: withMarkdown(note, (md) => exportNoteAs(plainTitle(note.title), md, format)),
            })),
          ],
        },
        { actions: [{ id: "delete", title: "Delete Note", icon: "trash-16", style: "destructive", shortcut: S.deleteNote, onAction: () => remove(note) }] },
      ],
    };
  };

  const runPanelAction = (action: ActionModel) => {
    setActionsOpen(false);
    inputRef.current?.focus();
    void Promise.resolve(action.onAction?.()).catch((error: unknown) => showFailureToast(action.title, error));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const intent = navigationIntent(event.nativeEvent, bindings);
    if (intent === "up" || intent === "down") {
      event.preventDefault();
      move(intent === "up" ? -1 : 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) setQuery("");
      else close();
      return;
    }
    if (event.key === "Enter" && !event.metaKey && !event.altKey && !event.ctrlKey) {
      event.preventDefault();
      if (selected) openNote(selected);
      return;
    }
    if (matchesShortcut(event.nativeEvent, S.actions)) {
      event.preventDefault();
      event.stopPropagation();
      if (selected) setActionsOpen(true);
      return;
    }
    if (matchesShortcut(event.nativeEvent, S.browse)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (!selected) return;
    for (const section of actionModel(selected).sections) {
      for (const action of section.actions) {
        if (action.shortcut && action.id !== "open" && matchesShortcut(event.nativeEvent, action.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          runPanelAction(action);
          return;
        }
      }
    }
  };

  const renderRow = (index: number) => {
    const row = rows[index];
    if (row.kind === "header") {
      return (
        <div className="sc-menu__header" data-first={index === 0 || undefined}>
          <span className="sc-truncate">{row.title}</span>
        </div>
      );
    }
    const { note } = row;
    const isCurrent = note.id === currentId;
    const isSelected = index === effectiveIndex;
    const characters = pluralize(isCurrent ? liveCharacters : note.characters, "character");
    return (
      <div
        className="sc-notes-browse__item"
        role="option"
        aria-selected={isSelected}
        data-selected={isSelected || undefined}
        onMouseMove={() => !isSelected && setSelectedId(note.id)}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => openNote(note)}
      >
        <div className="sc-notes-browse__text">
          <span className="sc-notes-browse__title sc-truncate">{plainTitle(note.title)}</span>
          <span className="sc-notes-browse__subtitle sc-truncate">
            {isCurrent ? (
              <>
                <span className="sc-notes-browse__dot" />
                {`Current • ${characters}`}
              </>
            ) : (
              `Opened ${timeAgo(note.lastOpenedAt ?? note.updatedAt)} • ${characters}`
            )}
          </span>
        </div>
        {isSelected && (
          <div className="sc-notes-browse__accessories">
            <Tooltip content={note.pinned ? "Unpin" : "Pin"}>
              <button
                type="button"
                className="sc-notes-browse__icon-button"
                aria-label={note.pinned ? "Unpin Note" : "Pin Note"}
                onClick={(event) => {
                  event.stopPropagation();
                  void controller.togglePin(note.id, Boolean(note.pinned));
                }}
              >
                <Icon name={note.pinned ? "tack-disabled-16" : "tack-16"} size={16} />
              </button>
            </Tooltip>
            <Tooltip content="Delete Note">
              <button
                type="button"
                className="sc-notes-browse__icon-button"
                aria-label="Delete Note"
                onClick={(event) => {
                  event.stopPropagation();
                  void remove(note);
                }}
              >
                <Icon name="trash-16" size={16} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Popover
        open
        onClose={() => close()}
        anchor={(root) => ({ x: root.width / 2, y: PANEL_TOP })}
        side="bottom"
        align="center"
        offset={0}
        width={PANEL_WIDTH}
        flip={false}
        className="sc-notes-browse"
        aria-label="Browse Notes"
        role="dialog"
      >
        <div className="sc-menu__search sc-notes-browse__search" data-layout="down">
          <input
            ref={inputRef}
            className="sc-menu__search-input"
            placeholder="Search for notes…"
            value={query}
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
          {isLoading && <Spinner size={16} />}
        </div>
        <div className="sc-notes-browse__list" style={{ height: listHeight }} role="listbox" aria-label="Notes">
          {rows.length === 0 ? (
            <div className="sc-menu__empty">{isLoading ? "" : query ? "No Notes Found" : "No Notes"}</div>
          ) : (
            <VirtualList
              ref={listRef}
              heights={heights}
              rowKey={(index) => {
                const row = rows[index];
                return row.kind === "note" ? row.note.id : `header-${row.title}`;
              }}
              renderRow={renderRow}
              paddingTop={LIST_PADDING}
              paddingBottom={LIST_PADDING}
              scrollPaddingStart={LIST_PADDING}
              scrollPaddingEnd={LIST_PADDING}
            />
          )}
        </div>
      </Popover>
      <ActionPanelPopover
        model={selected ? actionModel(selected) : null}
        open={actionsOpen && selected !== null}
        onClose={() => {
          setActionsOpen(false);
          inputRef.current?.focus();
        }}
        onRun={runPanelAction}
        anchor={(root) => ({ x: root.width / 2 + PANEL_WIDTH / 2, y: PANEL_TOP + SEARCH_HEIGHT })}
        side="bottom"
      />
    </>
  );
}
