import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { backend } from "../../../bridge/backend";
import { Menu, Popover } from "../../../components";
import { Image } from "../../../icons/Image";
import { filterPlaceholderOptions, insertPlaceholder, placeholderOptions, placeholderQueryAt, snippetReference, tokenizeTemplate, type PlaceholderContext, type PlaceholderOption } from "./placeholders";
import "./template-editor.css";

export interface TemplateEditorHandle {
  focus: () => void;
  /** Insert `{` at the caret and open the placeholder menu (toolbar button). */
  startPlaceholder: () => void;
}

export interface TemplateEditorProps {
  value: string;
  onChange: (value: string) => void;
  context: PlaceholderContext;
  /** Multi-line snippet editor; single-line link field otherwise (newlines are dropped). */
  multiline?: boolean;
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  id?: string;
  "aria-label"?: string;
  /** Toolbar row inside the field (multi-line) or trailing buttons (single-line). */
  toolbar?: ReactNode;
}

interface MenuState {
  /** Index of the `{` that opened the menu. */
  start: number;
  mode: "placeholders" | "snippets";
}

const MENU_WIDTH = 208;

/**
 * Plain-text editor that highlights `{placeholders}` (a mirror layer draws
 * chips behind the text) and offers Raycast's `{` insertion menu at the caret.
 */
export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(function TemplateEditor(
  { value, onChange, context, multiline = false, placeholder, invalid, autoFocus, id, toolbar, ...aria },
  ref,
) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [caret, setCaret] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const options = useMemo(() => placeholderOptions(context), [context]);

  const query = menu?.mode === "placeholders" ? placeholderQueryAt(value, caret) : null;
  const activeQuery = query && menu && query.start === menu.start ? query.query : null;
  const matches = useMemo(() => (activeQuery === null ? [] : filterPlaceholderOptions(options, activeQuery)), [options, activeQuery]);
  const placeholderMenuOpen = menu?.mode === "placeholders" && activeQuery !== null && matches.length > 0;

  const syncScroll = useCallback(() => {
    const input = inputRef.current;
    if (!input) return;
    for (const layer of [mirrorRef.current, measureRef.current]) {
      if (!layer) continue;
      layer.scrollTop = input.scrollTop;
      layer.scrollLeft = input.scrollLeft;
    }
  }, []);

  // Restore a programmatic selection after React commits the new value.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const selection = pendingSelection.current;
    if (!input || !selection) return;
    pendingSelection.current = null;
    input.focus();
    input.setSelectionRange(selection[0], selection[1]);
    setCaret(selection[1]);
    syncScroll();
  });

  // Position the menu under the `{` that opened it.
  useLayoutEffect(() => {
    if (!menu) return;
    const input = inputRef.current;
    const measure = measureRef.current;
    const overlay = document.getElementById("sc-overlay-root");
    if (!input || !measure || !overlay) return;
    measure.textContent = value.slice(0, menu.start);
    const marker = document.createElement("span");
    marker.textContent = "{";
    measure.appendChild(marker);
    const inputRect = input.getBoundingClientRect();
    const rootRect = overlay.getBoundingClientRect();
    const x = inputRect.left - rootRect.left + marker.offsetLeft - input.scrollLeft - 8;
    const y = inputRect.top - rootRect.top + marker.offsetTop - input.scrollTop + marker.offsetHeight + 2;
    setAnchor((previous) => (previous && previous.x === x && previous.y === y ? previous : { x, y }));
  }, [menu, value]);

  const closeMenu = () => {
    setMenu(null);
    setSelectedIndex(0);
  };

  const replaceRange = (start: number, end: number, insert: string) => {
    const result = insertPlaceholder(value, start, end, insert);
    pendingSelection.current = result.selection;
    onChange(result.text);
  };

  const choose = (option: PlaceholderOption) => {
    if (!menu) return;
    if (option.opensSnippets) {
      setMenu({ ...menu, mode: "snippets" });
      return;
    }
    replaceRange(menu.start, caret, option.insert);
    closeMenu();
  };

  const startPlaceholder = () => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    pendingSelection.current = [start + 1, start + 1];
    onChange(`${value.slice(0, start)}{${value.slice(end)}`);
    setMenu({ start, mode: "placeholders" });
    setSelectedIndex(0);
  };

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), startPlaceholder }));

  const onInput = (next: string, input: HTMLTextAreaElement) => {
    const text = multiline ? next : next.replace(/\r?\n/g, "");
    const position = input.selectionStart ?? text.length;
    setCaret(position);
    // Typing `{` opens the menu at that brace.
    if (text.length === value.length + 1 && text[position - 1] === "{") {
      setMenu({ start: position - 1, mode: "placeholders" });
      setSelectedIndex(0);
    } else if (menu && (text[menu.start] !== "{" || position <= menu.start)) closeMenu();
    onChange(text);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (!multiline && event.key === "Enter" && !event.metaKey) event.preventDefault();
    if (!placeholderMenuOpen) {
      if (menu && event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
      return;
    }
    const down = event.key === "ArrowDown" || (event.ctrlKey && (event.key === "n" || event.key === "j"));
    const up = event.key === "ArrowUp" || (event.ctrlKey && (event.key === "p" || event.key === "k"));
    if (down || up) {
      event.preventDefault();
      setSelectedIndex((i) => (i + (down ? 1 : -1) + matches.length) % matches.length);
    } else if ((event.key === "Enter" && !event.metaKey && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      choose(matches[Math.min(selectedIndex, matches.length - 1)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  };

  const tokens = useMemo(() => tokenizeTemplate(value), [value]);
  const generalCount = matches.filter((o) => o.section === "general").length;

  return (
    <div className="sc-template-editor sc-field" data-multiline={multiline || undefined} data-validation={invalid ? "error" : undefined}>
      <div className="sc-template-editor__body">
        <div ref={mirrorRef} className="sc-template-editor__layer sc-template-editor__mirror" aria-hidden="true">
          {tokens.map((token, i) =>
            token.kind === "placeholder" ? (
              <span key={i} className="sc-template-editor__chip" data-known={token.known || undefined}>
                {token.text}
              </span>
            ) : (
              <span key={i}>{token.text}</span>
            ),
          )}
          {"​"}
        </div>
        <div ref={measureRef} className="sc-template-editor__layer sc-template-editor__measure" aria-hidden="true" />
        <textarea
          ref={inputRef}
          id={id}
          className="sc-template-editor__layer sc-template-editor__input"
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={multiline ? undefined : 1}
          wrap={multiline ? "soft" : "off"}
          spellCheck={false}
          autoComplete="off"
          aria-label={aria["aria-label"]}
          aria-invalid={invalid || undefined}
          onChange={(e) => onInput(e.currentTarget.value, e.currentTarget)}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onScroll={syncScroll}
          onKeyDown={onKeyDown}
          onBlur={() => menu?.mode === "placeholders" && closeMenu()}
        />
      </div>
      {toolbar}
      <Popover open={placeholderMenuOpen && anchor !== null} onClose={closeMenu} anchor={anchor} width={MENU_WIDTH} align="start" aria-label="Dynamic Placeholders">
        <div className="sc-menu sc-template-editor__menu" role="listbox" aria-label="Dynamic Placeholders">
          {matches.map((option, index) => (
            <div key={option.id}>
              {index === generalCount && generalCount > 0 && <div className="sc-template-editor__separator" role="separator" />}
              {index === generalCount && <div className="sc-template-editor__header">Date &amp; Time</div>}
              <div
                role="option"
                aria-selected={index === selectedIndex}
                className="sc-menu__item sc-template-editor__item"
                data-selected={index === selectedIndex || undefined}
                onMouseMove={() => index !== selectedIndex && setSelectedIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                <Image source={option.icon} size={16} className="sc-menu__icon" />
                <span className="sc-menu__title sc-truncate">{option.title}</span>
              </div>
            </div>
          ))}
        </div>
      </Popover>
      {menu?.mode === "snippets" && anchor && (
        <SnippetReferenceMenu
          anchor={anchor}
          onPick={(name) => {
            replaceRange(menu.start, caret, snippetReference(name));
            closeMenu();
          }}
          onBack={() => {
            setMenu({ ...menu, mode: "placeholders" });
            pendingSelection.current = [caret, caret];
          }}
          onClose={() => {
            closeMenu();
            inputRef.current?.focus();
          }}
        />
      )}
    </div>
  );
});

/** Second level of the `{` menu: pick a snippet to reference by name. */
function SnippetReferenceMenu({ anchor, onPick, onBack, onClose }: { anchor: { x: number; y: number }; onPick: (name: string) => void; onBack: () => void; onClose: () => void }) {
  const [names, setNames] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    backend
      .call("snippets.list", {})
      .then((list) => live && setNames([...new Set(list.map((s) => s.name))].sort((a, b) => a.localeCompare(b))))
      .catch(() => live && setNames([]));
    return () => {
      live = false;
    };
  }, []);
  return (
    <Popover open anchor={anchor} width={MENU_WIDTH + 40} align="start" onClose={onClose} aria-label="Snippets">
      {({ side }) => (
        <Menu
          layout={side === "top" ? "up" : "down"}
          searchPlaceholder="Search snippets…"
          isLoading={names === null}
          emptyText="No Snippets"
          sections={[{ title: "Snippets", items: (names ?? []).map((name) => ({ id: name, title: name, icon: "snippets-16" })) }]}
          onSelect={(item) => onPick(item.id)}
          onDismiss={onBack}
        />
      )}
    </Popover>
  );
}
