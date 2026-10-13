import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { ImageLike, KeyboardShortcut } from "@surgecast/protocol";
import { Image } from "../../icons/Image";
import { Icon } from "../../icons/Icon";
import { fuzzyFilter } from "../../lib/fuzzy";
import { eventKey, matchesShortcut } from "../../lib/keyboard";
import { scaled, useZoom } from "../../lib/zoom";
import { HighlightedText } from "../HighlightedText/HighlightedText";
import { Shortcut } from "../Keycap/Keycap";
import { Spinner } from "../Spinner/Spinner";
import { VirtualList, type VirtualListHandle } from "../ScrollArea/VirtualList";
import "./menu.css";

export interface MenuItem {
  id: string;
  title: string;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  accessoryText?: string;
  style?: "default" | "destructive";
  disabled?: boolean;
  keywords?: string[];
  /** Shows a checkmark (dropdown selection). */
  checked?: boolean;
  /** Shows a chevron; activating opens a submenu. */
  hasSubmenu?: boolean;
  /** Small tertiary glyphs before the accessory text (e.g. model capabilities). */
  badges?: { icon: ImageLike; label: string }[];
}

export interface MenuSection {
  id?: string;
  title?: string;
  items: MenuItem[];
}

export interface MenuProps {
  sections: MenuSection[];
  /** Optional header above the rows (e.g. the selected item's name). */
  title?: string;
  onSelect: (item: MenuItem) => void;
  /** Esc with an empty search: go back (submenu) or close. */
  onDismiss: () => void;
  /** Search field below the list ("up", action panel) or above it ("down", dropdowns). */
  layout?: "up" | "down";
  showSearch?: boolean;
  /** Route menu navigation through an existing input without moving its focus. */
  keyboardTarget?: HTMLElement | null;
  searchPlaceholder?: string;
  /** Filter locally (default). When false, the caller filters via onSearchTextChange. */
  filtering?: boolean;
  onSearchTextChange?: (text: string) => void;
  isLoading?: boolean;
  /** Keep sections while searching (default: flatten into one result list). */
  preserveSectionsOnSearch?: boolean;
  maxHeight?: number;
  emptyText?: string;
  /** Leading accessory inside the search field (e.g. back chevron for submenus). */
  searchAccessory?: ReactNode;
  /** Initially selected item id (default: first enabled). */
  initialSelectedId?: string;
  "aria-label"?: string;
}

type Row = { kind: "title"; text: string } | { kind: "header"; text: string } | { kind: "separator" } | { kind: "item"; item: MenuItem; ranges?: [number, number][] } | { kind: "empty" };

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 32; // 12 margin + 12 title + 8 margin
const FIRST_HEADER_HEIGHT = 24; // margin collapses into the list's 8px top padding
const SEPARATOR_HEIGHT = 17; // 8 + 0.5 + 8, rounded
const LIST_PADDING = 8;

/** Build display rows for sections, filtering by `query` when `filtering` is on. */
export function buildMenuRows(sections: MenuSection[], query: string, options: { filtering: boolean; preserveSections: boolean; title?: string }): Row[] {
  const rows: Row[] = [];
  if (options.title) rows.push({ kind: "title", text: options.title });
  const searching = options.filtering && query.trim().length > 0;
  if (searching && !options.preserveSections) {
    const hits = fuzzyFilter(
      sections.flatMap((s) => s.items),
      query,
      (item) => [{ text: item.title, highlight: true }, ...(item.keywords ?? []).map((k) => ({ text: k, weight: 0.8 }))],
    );
    for (const hit of hits) rows.push({ kind: "item", item: hit.item, ranges: hit.ranges });
  } else {
    let first = true;
    for (const section of sections) {
      const items = searching
        ? fuzzyFilter(section.items, query, (item) => [{ text: item.title, highlight: true }, ...(item.keywords ?? []).map((k) => ({ text: k, weight: 0.8 }))])
        : section.items.map((item) => ({ item, ranges: [] as [number, number][] }));
      if (items.length === 0) continue;
      if (!first) rows.push({ kind: "separator" });
      if (section.title) rows.push({ kind: "header", text: section.title });
      for (const { item, ranges } of items) rows.push({ kind: "item", item, ranges });
      first = false;
    }
  }
  if (!rows.some((r) => r.kind === "item")) rows.push({ kind: "empty" });
  return rows;
}

function rowHeight(row: Row, index: number): number {
  switch (row.kind) {
    case "title":
    case "header":
      return index === 0 ? FIRST_HEADER_HEIGHT : row.kind === "header" ? HEADER_HEIGHT - 12 : HEADER_HEIGHT;
    case "separator":
      return SEPARATOR_HEIGHT;
    default:
      return ROW_HEIGHT;
  }
}

/**
 * Searchable menu list (action panel, dropdowns, toast and app menus): 36px
 * rows inset 8px with radius 10, 16px icons, keycap accessories, section
 * separators, fuzzy filtering, and full keyboard control from the search field.
 */
export function Menu({
  sections,
  title,
  onSelect,
  onDismiss,
  layout = "up",
  showSearch = true,
  keyboardTarget,
  searchPlaceholder = "Search…",
  filtering = true,
  onSearchTextChange,
  isLoading = false,
  preserveSectionsOnSearch = false,
  maxHeight = 280,
  emptyText = "No Results",
  searchAccessory,
  initialSelectedId,
  ...aria
}: MenuProps) {
  const [query, setQuery] = useState("");
  const zoom = useZoom();
  const rows = useMemo(() => buildMenuRows(sections, query, { filtering, preserveSections: preserveSectionsOnSearch, title }), [sections, query, filtering, preserveSectionsOnSearch, title]);
  const heights = useMemo(() => rows.map((row, i) => scaled(rowHeight(row, i), zoom)), [rows, zoom]);
  const listPadding = scaled(LIST_PADDING, zoom);
  const selectable = useMemo(() => rows.map((r, i) => (r.kind === "item" && !r.item.disabled ? i : -1)).filter((i) => i >= 0), [rows]);
  const [selected, setSelected] = useState<number>(() => {
    const initial = initialSelectedId ? rows.findIndex((r) => r.kind === "item" && r.item.id === initialSelectedId) : -1;
    return initial >= 0 ? initial : (selectable[0] ?? -1);
  });
  const listRef = useRef<VirtualListHandle>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!selectable.includes(selected)) setSelected(selectable[0] ?? -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  useEffect(() => {
    listRef.current?.scrollToIndex(selected, "auto");
  }, [selected]);

  useEffect(() => {
    // Without a search field the menu itself takes focus so arrow keys and ↵ work.
    if (!keyboardTarget) (inputRef.current ?? rootRef.current)?.focus({ preventScroll: true });
  }, [keyboardTarget]);

  const contentHeight = heights.reduce((a, b) => a + b, 0) + listPadding * 2;
  const searchHeight = showSearch ? scaled(40, zoom) : 0;
  const listHeight = Math.min(contentHeight, scaled(maxHeight, zoom) - searchHeight);

  const activate = (index: number) => {
    const row = rows[index];
    if (row?.kind === "item" && !row.item.disabled) onSelect(row.item);
  };

  const move = (delta: number) => {
    if (selectable.length === 0) return;
    const pos = selectable.indexOf(selected);
    const next = pos === -1 ? 0 : Math.min(selectable.length - 1, Math.max(0, pos + delta));
    setSelected(selectable[next]);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement> | KeyboardEvent) => {
    const nativeEvent = "nativeEvent" in event ? event.nativeEvent : event;
    if (nativeEvent.isComposing || event.keyCode === 229) return;
    const key = eventKey(nativeEvent);
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
    if (key === "arrowDown" || (event.ctrlKey && (key === "n" || key === "j"))) {
      event.preventDefault();
      move(1);
    } else if (key === "arrowUp" || (event.ctrlKey && (key === "p" || key === "k"))) {
      event.preventDefault();
      move(-1);
    } else if (key === "return" && plain) {
      event.preventDefault();
      activate(selected);
    } else if (key === "escape") {
      event.preventDefault();
      event.stopPropagation();
      if (query) changeQuery("");
      else onDismiss();
    } else if (event.metaKey && /^[0-9]$/.test(key)) {
      const nth = key === "0" ? 9 : Number(key) - 1;
      if (selectable[nth] !== undefined) {
        event.preventDefault();
        activate(selectable[nth]);
      }
    } else {
      for (const row of rows) {
        if (row.kind === "item" && row.item.shortcut && !row.item.disabled && matchesShortcut(nativeEvent, row.item.shortcut)) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(row.item);
          return;
        }
      }
    }
  };

  useEffect(() => {
    if (!keyboardTarget) return;
    keyboardTarget.addEventListener("keydown", onKeyDown);
    return () => keyboardTarget.removeEventListener("keydown", onKeyDown);
  });

  const changeQuery = (text: string) => {
    setQuery(text);
    onSearchTextChange?.(text);
  };

  const renderRow = (index: number) => {
    const row = rows[index];
    switch (row.kind) {
      case "title":
      case "header":
        return (
          <div className="sc-menu__header" data-first={index === 0 || undefined} data-title={row.kind === "title" || undefined}>
            <span className="sc-truncate">{row.text}</span>
          </div>
        );
      case "separator":
        return <div className="sc-menu__separator" role="separator" />;
      case "empty":
        return <div className="sc-menu__empty">{isLoading ? "" : emptyText}</div>;
      case "item": {
        const { item } = row;
        return (
          <div
            id={`${listId}-${index}`}
            role="menuitem"
            aria-disabled={item.disabled || undefined}
            aria-checked={item.checked}
            className="sc-menu__item"
            data-selected={index === selected || undefined}
            data-style={item.style}
            data-disabled={item.disabled || undefined}
            onMouseMove={() => !item.disabled && index !== selected && setSelected(index)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => activate(index)}
          >
            {item.icon !== undefined && <Image source={item.icon} size={16} className="sc-menu__icon" />}
            <span className="sc-menu__title sc-truncate">
              <HighlightedText text={item.title} ranges={row.ranges} />
            </span>
            <span className="sc-menu__accessories">
              {item.badges?.map((badge) => (
                <span key={badge.label} className="sc-menu__badge" title={badge.label} aria-label={badge.label}>
                  <Image source={badge.icon} size={14} />
                </span>
              ))}
              {item.accessoryText && <span className="sc-menu__accessory-text sc-truncate">{item.accessoryText}</span>}
              {item.shortcut && <Shortcut shortcut={item.shortcut} />}
              {item.checked && <Icon name="checkmark-16" size={16} className="sc-menu__check" />}
              {item.hasSubmenu && <Icon name="chevron-right-16" size={16} className="sc-menu__chevron" />}
            </span>
          </div>
        );
      }
    }
  };

  const search = showSearch && (
    <div className="sc-menu__search" data-layout={layout}>
      {searchAccessory}
      <input
        ref={inputRef}
        className="sc-menu__search-input"
        placeholder={searchPlaceholder}
        value={query}
        onChange={(e) => changeQuery(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        aria-controls={listId}
        aria-activedescendant={selected >= 0 ? `${listId}-${selected}` : undefined}
        spellCheck={false}
        autoComplete="off"
      />
      {isLoading && <Spinner size={16} />}
    </div>
  );

  return (
    <div ref={rootRef} className="sc-menu" data-layout={layout} onKeyDown={showSearch ? undefined : onKeyDown} tabIndex={showSearch ? undefined : -1} aria-label={aria["aria-label"]}>
      {layout === "down" && search}
      <div className="sc-menu__list" style={{ height: listHeight }}>
        <VirtualList
          ref={listRef}
          id={listId}
          role="menu"
          heights={heights}
          rowKey={(i) => {
            const r = rows[i];
            return r.kind === "item" ? `i:${r.item.id}` : `${r.kind}:${i}`;
          }}
          renderRow={renderRow}
          paddingTop={listPadding}
          paddingBottom={listPadding}
          scrollPaddingStart={listPadding}
          scrollPaddingEnd={listPadding}
        />
      </div>
      {layout === "up" && search}
    </div>
  );
}
