import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Editor } from "@tiptap/core";
import { Icon } from "../../icons/Icon";
import { useEditorSelector } from "../hooks/useEditorSelector";
import { getFindState, replaceActiveMatch, replaceAllMatches, setFindQuery, stepFindMatch, selectMatch } from "../editor/find-replace";
import { useNotesStore } from "../store";

const FIND_INPUT_ID = "sc-notes-find-input";

function revealActiveMatch(): void {
  requestAnimationFrame(() => document.querySelector(".sc-notes-find-match--active")?.scrollIntoView({ block: "nearest" }));
}

function IconAction({ icon, label, disabled, onClick }: { icon: string; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="sc-notes-find__icon-button" aria-label={label} title={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}

/** Find & replace panel (§7.5): glass card under the header, match counter, previous/next, replace one/all. */
export function FindBar({ editor }: { editor: Editor }) {
  const findOpen = useNotesStore((state) => state.findOpen);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { count, active } = useEditorSelector(
    editor,
    (current) => {
      const state = getFindState(current);
      return { count: state.matches.length, active: state.active };
    },
    { count: 0, active: -1 },
  );

  useEffect(() => {
    if (!findOpen) return;
    // Seed the query with a single-line selection, like ⌘F in other editors.
    const { from, to, empty } = editor.state.selection;
    const selected = empty ? "" : editor.state.doc.textBetween(from, to, "\n");
    const seed = selected && !selected.includes("\n") ? selected : query;
    setQuery(seed);
    setFindQuery(editor, seed);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => setFindQuery(editor, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findOpen, editor]);

  useEffect(() => {
    const onFocusRequest = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("sc-notes-focus-find", onFocusRequest);
    return () => window.removeEventListener("sc-notes-focus-find", onFocusRequest);
  }, []);

  if (!findOpen) return null;

  const close = () => {
    useNotesStore.setState({ findOpen: false });
    editor.commands.focus();
  };
  const step = (delta: 1 | -1) => {
    stepFindMatch(editor, delta);
    revealActiveMatch();
  };
  const changeQuery = (value: string) => {
    setQuery(value);
    setFindQuery(editor, value);
    const state = getFindState(editor);
    if (state.active >= 0) {
      selectMatch(editor, state.active);
      revealActiveMatch();
    }
  };
  const replaceOne = () => {
    if (replaceActiveMatch(editor, replacement)) revealActiveMatch();
  };
  const onFindKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  const onReplaceKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.metaKey && event.altKey) replaceAllMatches(editor, replacement);
      else replaceOne();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const hasMatches = count > 0;
  const canReplace = query.length > 0 && hasMatches;
  return (
    <div className="sc-notes-find sc-glass-panel" role="search" aria-label="Find in Note">
      <div className="sc-notes-find__row">
        <button
          type="button"
          className="sc-notes-find__icon-button sc-notes-find__chevron"
          data-open={replaceOpen || undefined}
          aria-label={replaceOpen ? "Hide Replace" : "Show Replace"}
          aria-expanded={replaceOpen}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setReplaceOpen(!replaceOpen)}
        >
          <Icon name="chevron-right-16" size={16} />
        </button>
        <input
          ref={inputRef}
          id={FIND_INPUT_ID}
          className="sc-notes-find__input"
          placeholder="Find"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => changeQuery(event.currentTarget.value)}
          onKeyDown={onFindKey}
        />
        <div className="sc-notes-find__actions">
          <span className="sc-notes-find__count" aria-live="polite">
            {hasMatches ? `${Math.max(active, 0) + 1}/${count}` : "0/0"}
          </span>
          <IconAction icon="arrow-left-circle-filled-16" label="Previous Match" disabled={!hasMatches} onClick={() => step(-1)} />
          <IconAction icon="arrow-right-circle-filled-16" label="Next Match" disabled={!hasMatches} onClick={() => step(1)} />
          <span className="sc-notes-find__divider" />
          <IconAction icon="x-mark-circle-filled-16" label="Close Find" onClick={close} />
        </div>
      </div>
      {replaceOpen && (
        <>
          <span className="sc-notes-find__separator" />
          <div className="sc-notes-find__row">
            <input
              className="sc-notes-find__input sc-notes-find__replace-input"
              placeholder="Replace"
              value={replacement}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setReplacement(event.currentTarget.value)}
              onKeyDown={onReplaceKey}
            />
            <div className="sc-notes-find__actions">
              <IconAction icon="replace-one-16" label="Replace" disabled={!canReplace} onClick={replaceOne} />
              <IconAction icon="replace-16" label="Replace All" disabled={!canReplace} onClick={() => replaceAllMatches(editor, replacement)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Ask an open find bar to focus and select its input (⌘F while it is open). */
export function focusFindInput(): void {
  window.dispatchEvent(new Event("sc-notes-focus-find"));
}
