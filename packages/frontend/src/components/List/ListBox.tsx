import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLatest } from "../../bridge/hooks";
import { useSetting } from "../../bridge/settings";
import { eventKey, navigationIntent } from "../../lib/keyboard";
import { VirtualList, type VirtualListHandle } from "../ScrollArea/VirtualList";
import { useOptionalViewController } from "../View/contexts";
import { ListItemRow, type ListRowSize } from "./ListItemRow";
import { moveSelection, reconcileSelection } from "./navigation";
import type { ListItemModel, ListSectionModel } from "./model";
import "./list.css";

type Row = { kind: "header"; key: string; section: ListSectionModel; first: boolean } | { kind: "item"; key: string; item: ListItemModel };

const SIZE_HEIGHT: Record<ListRowSize, number> = { large: 38, small: 36, multiline: 58 };
const FIRST_HEADER = 24; // 4px margin (12 − list padding 8) + 12 title + 8 margin
const HEADER = 32; // 12 margin + 12 title + 8 margin

export interface ListBoxProps {
  sections: ListSectionModel[];
  selectedId: string | null;
  onSelectedIdChange: (id: string | null) => void;
  /** Run the item's primary action (Enter is handled by the frame; this is for clicks and ⌘1–9). */
  onActivate: (item: ListItemModel) => void;
  size?: ListRowSize;
  /** Click runs the primary action immediately (root search); otherwise click selects, double-click runs. */
  activateOnClick?: boolean;
  /** Show 1…9, 0 hints while ⌘ is held; ⌘+digit runs that row. */
  numberHints?: boolean;
  /** Space reserved for the overlaid header/footer. */
  paddingTop?: number;
  paddingBottom?: number;
  /** Rendered instead of the list when there are no items. */
  emptyView?: ReactNode;
  /** Called when the selection gets close to the end (pagination). */
  onNearEnd?: () => void;
  className?: string;
  "aria-label"?: string;
}

function buildRows(sections: ListSectionModel[]): Row[] {
  const rows: Row[] = [];
  let first = true;
  for (const section of sections) {
    if (section.items.length === 0) continue;
    if (section.title) rows.push({ kind: "header", key: `h:${section.id}`, section, first });
    for (const item of section.items) rows.push({ kind: "item", key: `i:${item.id}`, item });
    first = false;
  }
  return rows;
}

/**
 * Virtualized, keyboard-driven list of sections and items. Selection is
 * controlled by the parent; this handles movement (↑↓, emacs/vim bindings,
 * page keys), hover, scroll-into-view, and ⌘ number hints.
 */
export function ListBox({
  sections,
  selectedId,
  onSelectedIdChange,
  onActivate,
  size = "large",
  activateOnClick = false,
  numberHints = false,
  paddingTop = 64,
  paddingBottom = 52,
  emptyView,
  onNearEnd,
  className,
  ...aria
}: ListBoxProps) {
  const view = useOptionalViewController();
  const bindings = useSetting("keyboard.navigationBindings");
  const listRef = useRef<VirtualListHandle>(null);
  const rows = useMemo(() => buildRows(sections), [sections]);
  const heights = useMemo(
    () => rows.map((row, i) => (row.kind === "header" ? (row.first && i === 0 ? FIRST_HEADER : HEADER) : (row.item.height ?? SIZE_HEIGHT[size]))),
    [rows, size],
  );
  const selectable = useMemo(() => rows.map((r) => r.kind === "item" && !r.item.disabled), [rows]);
  const ids = useMemo(() => rows.map((r) => (r.kind === "item" ? r.item.id : null)), [rows]);
  const selectedIndex = selectedId === null ? -1 : ids.indexOf(selectedId);
  const lastIndex = useRef(selectedIndex);
  const [hintsVisible, setHintsVisible] = useState(false);
  const [viewportTop, setViewportTop] = useState(0);
  const domPrefix = view?.listId ?? "sc-list";

  // Keep a valid selection when rows change.
  useEffect(() => {
    if (selectedIndex >= 0 && selectable[selectedIndex]) {
      lastIndex.current = selectedIndex;
      return;
    }
    const next = reconcileSelection(ids, selectable, selectedId, lastIndex.current);
    const nextId = next >= 0 ? ids[next] : null;
    if (nextId !== selectedId) onSelectedIdChange(nextId);
  }, [ids, selectable, selectedId, selectedIndex, onSelectedIdChange]);

  // Reveal the selection; keep the section header visible for a section's first item.
  useEffect(() => {
    if (selectedIndex < 0) return;
    const prev = rows[selectedIndex - 1];
    const from = prev?.kind === "header" ? selectedIndex - 1 : selectedIndex;
    listRef.current?.scrollToIndex(selectedIndex, "auto", from);
    view?.setActiveDescendant(`${domPrefix}-${selectedIndex}`);
    if (onNearEnd) {
      const remaining = selectable.slice(selectedIndex + 1).filter(Boolean).length;
      if (remaining < 10) onNearEnd();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, rows]);

  const select = useCallback((index: number) => onSelectedIdChange(index >= 0 ? ids[index] : null), [ids, onSelectedIdChange]);

  // Visible selectable rows, top to bottom, for ⌘ number hints.
  const hintTargets = useMemo(() => {
    if (!numberHints) return [] as number[];
    const out: number[] = [];
    let y = paddingTop;
    for (let i = 0; i < rows.length && out.length < 10; i++) {
      if (selectable[i] && y + heights[i] > viewportTop + paddingTop - 4) out.push(i);
      y += heights[i];
    }
    return out;
  }, [numberHints, rows.length, selectable, heights, viewportTop, paddingTop]);

  const state = useLatest({ selectedIndex, selectable, rows, hintTargets, bindings });

  useEffect(() => {
    if (!view) return;
    return view.registerKeyHandler((event) => {
      const s = state.current;
      const intent = navigationIntent(event, s.bindings);
      if (intent === "up" || intent === "down" || intent === "pageUp" || intent === "pageDown") {
        const pageSize = listRef.current?.pageSize(SIZE_HEIGHT[size]) ?? 8;
        const next = moveSelection(s.selectable, s.selectedIndex, intent, pageSize);
        if (next >= 0) select(next);
        return true;
      }
      if (numberHints && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        const key = eventKey(event);
        if (/^[0-9]$/.test(key)) {
          const target = s.hintTargets[key === "0" ? 9 : Number(key) - 1];
          const row = target !== undefined ? s.rows[target] : undefined;
          if (row?.kind === "item") {
            select(target);
            onActivate(row.item);
            return true;
          }
        }
      }
      return false;
    });
  }, [view, state, select, size, numberHints, onActivate]);

  // ⌘ held for 400ms shows number hints (CSS handles the delay).
  useEffect(() => {
    if (!numberHints) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Meta") setHintsVisible(true);
      else if (!e.metaKey) setHintsVisible(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta" || !e.metaKey) setHintsVisible(false);
    };
    const blur = () => setHintsVisible(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [numberHints]);

  if (rows.length === 0) return <>{emptyView ?? null}</>;

  const renderRow = (index: number) => {
    const row = rows[index];
    if (row.kind === "header") {
      return (
        <div className="sc-list-section" data-first={(row.first && index === 0) || undefined} role="presentation">
          <span className="sc-list-section__title sc-truncate">{row.section.title}</span>
          {row.section.subtitle && <span className="sc-list-section__subtitle sc-truncate">{row.section.subtitle}</span>}
          {row.section.accessory && <span className="sc-list-section__accessory">{row.section.accessory}</span>}
        </div>
      );
    }
    const hintPosition = hintsVisible ? hintTargets.indexOf(index) : -1;
    return (
      <ListItemRow
        item={row.item}
        domId={`${domPrefix}-${index}`}
        selected={index === selectedIndex}
        size={size}
        hint={hintPosition >= 0 ? String((hintPosition + 1) % 10) : undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (row.item.disabled) return;
          if (activateOnClick || index === selectedIndex) {
            select(index);
            if (activateOnClick) onActivate(row.item);
          } else select(index);
        }}
        onDoubleClick={() => !activateOnClick && !row.item.disabled && onActivate(row.item)}
      />
    );
  };

  return (
    <VirtualList
      ref={listRef}
      id={domPrefix}
      role="listbox"
      className={`sc-list${className ? ` ${className}` : ""}`}
      heights={heights}
      rowKey={(i) => rows[i].key}
      renderRow={renderRow}
      paddingTop={paddingTop}
      paddingBottom={paddingBottom}
      scrollPaddingStart={paddingTop}
      scrollPaddingEnd={paddingBottom}
      fade={{ top: paddingTop + 32, bottom: paddingBottom + 20 }}
      thumbInset={{ top: paddingTop, bottom: paddingBottom }}
      aria-label={aria["aria-label"]}
      onScrollTop={numberHints ? setViewportTop : undefined}
    />
  );
}
