import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ColorLike, ImageLike } from "@surgecast/protocol";
import { useLatest } from "../../bridge/hooks";
import { useSetting } from "../../bridge/settings";
import { resolveColor } from "../../icons/colors";
import { Image } from "../../icons/Image";
import { isEmoji } from "../../icons/image-source";
import { fuzzyFilter } from "../../lib/fuzzy";
import { navigationIntent } from "../../lib/keyboard";
import { useTheme } from "../../theme/ThemeProvider";
import { collectActions, type ActionsProp } from "../actions/ActionPanel";
import { primaryActions } from "../actions/model";
import { EmptyView } from "../EmptyView/EmptyView";
import { flattenElements, type EmptyViewMarkerProps, ListEmptyView } from "../List/collect";
import { ListDropdown } from "../List/ListDropdown";
import { moveGridSelection } from "../List/navigation";
import { VirtualList, type VirtualListHandle } from "../ScrollArea/VirtualList";
import { Tooltip } from "../Tooltip/Tooltip";
import { useOptionalViewController } from "../View/contexts";
import { useActionContext, useRegisterActions } from "../View/useRegisterActions";
import { ViewFrame } from "../View/ViewFrame";
import "./grid.css";

export type GridAspectRatio = "1" | "3/2" | "2/3" | "4/3" | "3/4" | "16/9" | "9/16";
export type GridFit = "contain" | "fill";
export type GridInset = "zero" | "small" | "medium" | "large";
export type GridContent = ImageLike | { color: ColorLike } | { value: ImageLike | { color: ColorLike }; tooltip?: string };

export interface GridItemProps {
  id?: string;
  content: GridContent;
  title?: string;
  subtitle?: string;
  accessory?: { icon: ImageLike; tooltip?: string | null };
  keywords?: string[];
  actions?: ActionsProp;
}

export interface GridSectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  columns?: number;
  aspectRatio?: GridAspectRatio;
  fit?: GridFit;
  inset?: GridInset;
  children?: ReactNode;
}

export interface GridProps {
  children?: ReactNode;
  columns?: number;
  aspectRatio?: GridAspectRatio;
  fit?: GridFit;
  inset?: GridInset;
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  searchBarPlaceholder?: string;
  filtering?: boolean;
  isLoading?: boolean;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  searchBarAccessory?: ReactNode;
  actions?: ActionsProp;
  selectedItemId?: string;
  onSelectionChange?: (id: string | null) => void;
  pagination?: { hasMore: boolean; onLoadMore: () => void; pageSize?: number };
  primaryActionTitle?: string;
}

function GridItem(_: GridItemProps): null {
  return null;
}
function GridSection(_: GridSectionProps): null {
  return null;
}

interface GridItemModel extends GridItemProps {
  id: string;
}
interface GridSectionModel {
  id: string;
  title?: string;
  subtitle?: string;
  columns: number;
  aspectRatio: GridAspectRatio;
  fit: GridFit;
  inset: GridInset;
  items: GridItemModel[];
}

const RATIO: Record<GridAspectRatio, number> = { "1": 1, "3/2": 1.5, "2/3": 2 / 3, "4/3": 4 / 3, "3/4": 0.75, "16/9": 16 / 9, "9/16": 9 / 16 };

/** Inset padding by column count (§5.2). */
export function gridInset(inset: GridInset, columns: number): number {
  if (inset === "zero") return 0;
  const table = columns <= 4 ? { small: 32, medium: 40, large: 58 } : columns <= 7 ? { small: 16, medium: 24, large: 32 } : { small: 12, medium: 16, large: 24 };
  return table[inset];
}

/** Height below a cell for its title/subtitle/accessory (§5.2). */
function detailsHeight(items: GridItemModel[]): number {
  const hasTitle = items.some((i) => i.title || i.accessory);
  const hasSubtitle = items.some((i) => i.subtitle);
  if (hasTitle && hasSubtitle) return 42;
  if (hasTitle || hasSubtitle) return 24;
  return 0;
}

function collectGrid(children: ReactNode, defaults: { columns: number; aspectRatio: GridAspectRatio; fit: GridFit; inset: GridInset }) {
  const sections: GridSectionModel[] = [];
  let emptyView = null as EmptyViewMarkerProps | null;
  let loose: GridItemModel[] = [];
  const toItem = (el: { props: unknown; key: string | null }, i: number, prefix: string): GridItemModel => {
    const props = el.props as GridItemProps;
    return { ...props, id: props.id ?? (el.key !== null ? String(el.key) : `${prefix}${i}`) };
  };
  const flush = () => {
    if (loose.length) sections.push({ id: `loose-${sections.length}`, ...defaults, items: loose });
    loose = [];
  };
  flattenElements(children).forEach((child, i) => {
    if (child.type === GridItem) loose.push(toItem(child, i, "item-"));
    else if (child.type === GridSection) {
      flush();
      const p = child.props as GridSectionProps;
      const id = p.id ?? (child.key !== null ? String(child.key) : `section-${sections.length}`);
      sections.push({
        id,
        title: p.title,
        subtitle: p.subtitle,
        columns: p.columns ?? defaults.columns,
        aspectRatio: p.aspectRatio ?? defaults.aspectRatio,
        fit: p.fit ?? defaults.fit,
        inset: p.inset ?? defaults.inset,
        items: flattenElements(p.children)
          .filter((c) => c.type === GridItem)
          .map((c, j) => toItem(c, j, `${id}/`)),
      });
    } else if (child.type === ListEmptyView) emptyView = child.props as EmptyViewMarkerProps;
  });
  flush();
  return { sections, emptyView };
}

type Row = { kind: "header"; section: GridSectionModel; first: boolean } | { kind: "row"; section: GridSectionModel; start: number; flatStart: number; last: boolean };

/** Raycast-style grid view: sections of cells with an image/emoji/color, keyboard navigation in 2D. */
export function Grid(props: GridProps) {
  const [internalText, setInternalText] = useState("");
  const searchText = props.searchText ?? internalText;
  return (
    <ViewFrame
      searchBar={{
        value: searchText,
        onChange: (text) => {
          if (props.searchText === undefined) setInternalText(text);
          props.onSearchTextChange?.(text);
        },
        placeholder: props.searchBarPlaceholder ?? "Search…",
      }}
      headerAccessory={props.searchBarAccessory}
      isLoading={props.isLoading}
      navigationTitle={props.navigationTitle}
      navigationIcon={props.navigationIcon}
      primaryActionTitle={props.primaryActionTitle}
    >
      <GridContentView {...props} searchText={searchText} />
    </ViewFrame>
  );
}

function GridContentView({ children, columns = 5, aspectRatio = "1", fit = "contain", inset = "zero", searchText = "", onSearchTextChange, filtering, isLoading, actions, selectedItemId, onSelectionChange, pagination }: GridProps) {
  const view = useOptionalViewController();
  const actionContext = useActionContext();
  const bindings = useSetting("keyboard.navigationBindings");
  const { sections: allSections, emptyView } = useMemo(() => collectGrid(children, { columns, aspectRatio, fit, inset }), [children, columns, aspectRatio, fit, inset]);
  const filterEnabled = filtering ?? !onSearchTextChange;
  const sections = useMemo(() => {
    if (!filterEnabled || !searchText.trim()) return allSections.filter((s) => s.items.length);
    return allSections
      .map((s) => ({ ...s, items: fuzzyFilter(s.items, searchText, (i) => [{ text: i.title }, { text: i.subtitle, weight: 0.7 }, ...(i.keywords ?? []).map((k) => ({ text: k, weight: 0.8 }))]).map((h) => h.item) }))
      .filter((s) => s.items.length);
  }, [allSections, filterEnabled, searchText]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const [width, setWidth] = useState(750);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowWidth = Math.max(100, width - 32);
  const { rows, heights } = useMemo(() => {
    const out: Row[] = [];
    const hs: number[] = [];
    let flatStart = 0;
    sections.forEach((section, si) => {
      const lastSection = si === sections.length - 1;
      if (section.title) {
        out.push({ kind: "header", section, first: si === 0 });
        hs.push(si === 0 ? 32 : 24);
      }
      const cell = (rowWidth - 8 * (section.columns - 1)) / section.columns;
      const cellHeight = Math.round(cell / RATIO[section.aspectRatio]);
      const details = detailsHeight(section.items);
      const rowCount = Math.ceil(section.items.length / section.columns);
      for (let r = 0; r < rowCount; r++) {
        const lastRow = r === rowCount - 1;
        out.push({ kind: "row", section, start: r * section.columns, flatStart: flatStart + r * section.columns, last: lastRow });
        const finalRow = lastRow && lastSection;
        hs.push(cellHeight + details + (finalRow ? 0 : 8) + (details && !finalRow ? 4 : 0));
      }
      flatStart += section.items.length;
    });
    return { rows: out, heights: hs };
  }, [sections, rowWidth]);

  const [selectedId, setSelectedId] = useState<string | null>(selectedItemId ?? null);
  useEffect(() => {
    if (selectedItemId !== undefined) setSelectedId(selectedItemId);
  }, [selectedItemId]);
  const lastQuery = useRef(searchText);
  if (lastQuery.current !== searchText) {
    lastQuery.current = searchText;
    if (flat[0] && flat[0].id !== selectedId) setSelectedId(flat[0].id);
  }
  let selectedIndex = flat.findIndex((i) => i.id === selectedId);
  if (selectedIndex === -1 && flat.length) selectedIndex = 0;
  const selected = flat[selectedIndex];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const onSelectionChangeRef = useLatest(onSelectionChange);
  const select = useCallback(
    (index: number) => {
      const item = flat[index];
      if (!item) return;
      setSelectedId(item.id);
      onSelectionChangeRef.current?.(item.id);
    },
    [flat, onSelectionChangeRef],
  );

  const listRef = useRef<VirtualListHandle>(null);
  useEffect(() => {
    if (selectedIndex < 0) return;
    const rowIndex = rows.findIndex((r) => r.kind === "row" && selectedIndex >= r.flatStart && selectedIndex < r.flatStart + r.section.columns);
    if (rowIndex < 0) return;
    const header = rows[rowIndex - 1]?.kind === "header" ? rowIndex - 1 : rowIndex;
    listRef.current?.scrollToIndex(rowIndex, "auto", header);
    if (pagination?.hasMore && !isLoading && flat.length - selectedIndex <= (pagination.pageSize ?? 20) / 2) pagination.onLoadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, rows]);

  const isEmpty = flat.length === 0;
  useRegisterActions(isEmpty ? (emptyView?.actions ?? actions) : (selected?.actions ?? actions));

  const activate = useCallback(
    (item: GridItemModel) => {
      const { primary } = primaryActions(collectActions(item.actions ?? actions, actionContext));
      if (primary) view?.runAction(primary);
    },
    [actions, actionContext, view],
  );

  const state = useLatest({ selectedIndex, sections, bindings });
  useEffect(() => {
    if (!view) return;
    return view.registerKeyHandler((event) => {
      const s = state.current;
      let intent = navigationIntent(event, s.bindings);
      if (!intent && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        if (event.key === "ArrowLeft") intent = "left";
        if (event.key === "ArrowRight") intent = "right";
      }
      if (intent === "pageUp" || intent === "pageDown") intent = intent === "pageUp" ? "up" : "down";
      if (!intent) return false;
      const next = moveGridSelection(
        s.sections.map((sec) => ({ count: sec.items.length, columns: sec.columns })),
        s.selectedIndex,
        intent,
      );
      if (next >= 0) select(next);
      return true;
    });
  }, [view, state, select]);

  if (isEmpty) {
    if (isLoading) return null;
    return emptyView ? <EmptyView title={emptyView.title} description={emptyView.description} icon={emptyView.icon} /> : <EmptyView title={searchText ? "No Results" : "No Items"} />;
  }

  const renderRow = (index: number) => {
    const row = rows[index];
    if (row.kind === "header") {
      return (
        <div className="sc-grid-section" role="presentation">
          <span className="sc-grid-section__title sc-truncate">{row.section.title}</span>
          {row.section.subtitle && <span className="sc-grid-section__subtitle">{row.section.subtitle}</span>}
        </div>
      );
    }
    const { section } = row;
    const cellWidth = (rowWidth - 8 * (section.columns - 1)) / section.columns;
    const items = section.items.slice(row.start, row.start + section.columns);
    return (
      <div className="sc-grid-row" style={{ gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` }} role="row">
        {items.map((item, i) => {
          const flatIndex = row.flatStart + i;
          return (
            <GridCell
              key={item.id}
              item={item}
              cellWidth={cellWidth}
              aspectRatio={RATIO[section.aspectRatio]}
              fit={section.fit}
              inset={gridInset(section.inset, section.columns)}
              selected={flatIndex === selectedIndex}
              onClick={() => (flatIndex === selectedIndex ? activate(item) : select(flatIndex))}
              onDoubleClick={() => activate(item)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div ref={wrapRef} className="sc-grid">
      <VirtualList
        ref={listRef}
        role="grid"
        heights={heights}
        rowKey={(i) => {
          const r = rows[i];
          return r.kind === "header" ? `h:${r.section.id}` : `r:${r.section.id}:${r.start}`;
        }}
        renderRow={renderRow}
        paddingTop={56}
        paddingBottom={52}
        scrollPaddingStart={64}
        scrollPaddingEnd={52}
        fade={{ top: 96, bottom: 72 }}
        thumbInset={{ top: 64, bottom: 52 }}
      />
    </div>
  );
}

interface GridCellProps {
  item: GridItemModel;
  cellWidth: number;
  aspectRatio: number;
  fit: GridFit;
  inset: number;
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

function contentParts(content: GridContent): { image?: ImageLike; color?: ColorLike; tooltip?: string } {
  if (typeof content === "object" && content !== null && "value" in content && !("source" in content)) {
    const inner = content.value;
    const tooltip = content.tooltip;
    if (typeof inner === "object" && inner !== null && "color" in inner) return { color: inner.color, tooltip };
    return { image: inner as ImageLike, tooltip };
  }
  if (typeof content === "object" && content !== null && "color" in content) return { color: content.color };
  return { image: content as ImageLike };
}

const GridCell = memo(function GridCell({ item, cellWidth, aspectRatio, fit, inset, selected, onClick, onDoubleClick }: GridCellProps) {
  const { appearance } = useTheme();
  const { image, color, tooltip } = contentParts(item.content);
  const emoji = typeof image === "string" && isEmoji(image) ? image : null;
  const cellHeight = Math.round(cellWidth / aspectRatio);
  const innerSize = Math.max(8, Math.min(cellWidth, cellHeight) - inset * 2);
  let body: ReactNode = null;
  if (color) body = <span className="sc-grid-cell__color" style={{ background: resolveColor(color, appearance) }} />;
  else if (emoji) {
    body = (
      <>
        {selected && (
          <span className="sc-grid-cell__ambient" aria-hidden="true">
            {emoji}
          </span>
        )}
        <span className="sc-grid-cell__emoji" style={{ fontSize: Math.round(cellWidth * 0.45) }}>
          {emoji}
        </span>
      </>
    );
  } else if (image !== undefined) {
    const isUrl = typeof image === "string" && /^(https?|data|surgecast-file|file):|^\//.test(image);
    body = isUrl ? (
      <span className="sc-grid-cell__image" data-fit={fit} style={{ padding: inset }}>
        <Image source={image} size={Math.max(cellWidth, cellHeight)} className="sc-grid-cell__img" />
      </span>
    ) : (
      <Image source={image} size={Math.round(innerSize * (inset ? 1 : 0.5))} />
    );
  }
  const cell = (
    <div
      className="sc-grid-cell"
      role="gridcell"
      aria-selected={selected}
      aria-label={item.title}
      data-selected={selected || undefined}
      style={{ "--cell-aspect": String(aspectRatio) } as CSSProperties}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {body}
    </div>
  );
  return (
    <div className="sc-grid-item">
      {tooltip ? <Tooltip content={tooltip}>{cell}</Tooltip> : cell}
      {(item.title || item.subtitle || item.accessory) && (
        <div className="sc-grid-item__details">
          {item.title && <span className="sc-grid-item__title sc-truncate">{item.title}</span>}
          {item.accessory && (
            <span className="sc-grid-item__accessory" title={item.accessory.tooltip ?? undefined}>
              <Image source={item.accessory.icon} size={16} />
            </span>
          )}
          {item.subtitle && <span className="sc-grid-item__subtitle sc-truncate">{item.subtitle}</span>}
        </div>
      )}
    </div>
  );
});

Grid.Item = GridItem;
Grid.Section = GridSection;
Grid.EmptyView = ListEmptyView;
Grid.Dropdown = ListDropdown;
