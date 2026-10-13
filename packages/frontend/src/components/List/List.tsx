import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { ImageLike } from "@opencast/protocol";
import { useLatest } from "../../bridge/hooks";
import { fuzzyFilter } from "../../lib/fuzzy";
import { collectActions, type ActionsProp } from "../actions/ActionPanel";
import { primaryActions } from "../actions/model";
import { ItemDetail, type ItemDetailProps } from "../Detail/Detail";
import { EmptyView } from "../EmptyView/EmptyView";
import { useOptionalViewController } from "../View/contexts";
import { useActionContext, useRegisterActions } from "../View/useRegisterActions";
import { ViewFrame } from "../View/ViewFrame";
import { collectListChildren, ListEmptyView, ListItem, ListSection, type EmptyViewMarkerProps } from "./collect";
import { ListBox } from "./ListBox";
import type { ListRowSize } from "./ListItemRow";
import { textValue, type ListItemModel, type ListSectionModel } from "./model";
import { ListDropdown } from "./ListDropdown";

export interface ListProps {
  children?: ReactNode;
  searchText?: string;
  onSearchTextChange?: (text: string) => void;
  searchBarPlaceholder?: string;
  /** Local fuzzy filtering; defaults to true unless `onSearchTextChange` is set. */
  filtering?: boolean | { keepSectionOrder: boolean };
  /** Debounce `onSearchTextChange` (Raycast `throttle`). */
  throttle?: boolean;
  isLoading?: boolean;
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  /** Usually a `<List.Dropdown>`. */
  searchBarAccessory?: ReactNode;
  /** Actions when no item is selected (or the empty view). */
  actions?: ActionsProp;
  isShowingDetail?: boolean;
  selectedItemId?: string;
  onSelectionChange?: (id: string | null) => void;
  pagination?: { hasMore: boolean; onLoadMore: () => void; pageSize?: number };
  /** OpenCast: row size ("large" 38px default, "small" 36px, "multiline" 58px). */
  size?: ListRowSize;
  /** OpenCast: detail pane width ("large" 465px default, "small" 263px). */
  detailWidth?: "small" | "large";
  /** OpenCast: footer label for the primary action. */
  primaryActionTitle?: string;
  /** OpenCast: keep row accessories while the detail pane is open (built-in snippet/quicklink rows show their keyword). */
  keepAccessoriesInDetail?: boolean;
}

/** `<List.Item.Detail>`: rendered in the detail pane of a list with `isShowingDetail`. */
function ListItemDetail(_: ItemDetailProps): null {
  return null;
}

function filterSections(sections: ListSectionModel[], query: string, keepSectionOrder: boolean): ListSectionModel[] {
  const fields = (item: ListItemModel) => [
    { text: textValue(item.title), highlight: true },
    { text: textValue(item.subtitle), weight: 0.7 },
    ...(item.keywords ?? []).map((k) => ({ text: k, weight: 0.8 })),
  ];
  const scored = sections.map((section, order) => {
    const hits = fuzzyFilter(section.items, query, fields);
    return { order, best: hits[0]?.score ?? -Infinity, section: { ...section, items: hits.map((h) => ({ ...h.item, titleRanges: h.ranges })) } };
  });
  const kept = scored.filter((s) => s.section.items.length > 0);
  if (!keepSectionOrder) kept.sort((a, b) => b.best - a.best || a.order - b.order);
  return kept.map((s) => s.section);
}

function useDebounced(fn: ((text: string) => void) | undefined, enabled: boolean, delay = 200): ((text: string) => void) | undefined {
  const latest = useLatest(fn);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return useMemo(() => {
    if (!fn) return undefined;
    if (!enabled) return (text: string) => latest.current?.(text);
    return (text: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current?.(text), delay);
    };
  }, [Boolean(fn), enabled, delay, latest]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Raycast-style list view: search bar, sections of items with accessories,
 * keyboard navigation, local filtering, optional detail pane, empty view and
 * pagination. Children are `<List.Section>` / `<List.Item>` / `<List.EmptyView>`.
 */
export function List(props: ListProps) {
  const [internalText, setInternalText] = useState("");
  const searchText = props.searchText ?? internalText;
  const notify = useDebounced(props.onSearchTextChange, Boolean(props.throttle));
  const onChange = useCallback(
    (text: string) => {
      if (props.searchText === undefined) setInternalText(text);
      notify?.(text);
    },
    [props.searchText, notify],
  );

  return (
    <ViewFrame
      searchBar={{ value: searchText, onChange, placeholder: props.searchBarPlaceholder ?? "Search…" }}
      headerAccessory={props.searchBarAccessory}
      isLoading={props.isLoading}
      navigationTitle={props.navigationTitle}
      navigationIcon={props.navigationIcon}
      primaryActionTitle={props.primaryActionTitle}
    >
      <ListContent {...props} searchText={searchText} />
    </ViewFrame>
  );
}

function ListContent({ children, searchText = "", onSearchTextChange, filtering, isLoading, actions, isShowingDetail, selectedItemId, onSelectionChange, pagination, size = "large", detailWidth = "large", keepAccessoriesInDetail = false }: ListProps) {
  const view = useOptionalViewController();
  const actionContext = useActionContext();
  const { sections: allSections, emptyView } = useMemo(() => collectListChildren(children), [children]);
  const filterEnabled = filtering === undefined ? !onSearchTextChange : Boolean(filtering);
  const keepOrder = typeof filtering === "object" ? filtering.keepSectionOrder : false;
  const sections = useMemo(() => {
    const filtered = filterEnabled && searchText.trim() ? filterSections(allSections, searchText, keepOrder) : allSections;
    // Like Raycast, rows only show icon and title while the detail pane is open.
    return isShowingDetail ? filtered.map((s) => ({ ...s, items: s.items.map((item) => ({ ...item, subtitle: undefined, accessories: keepAccessoriesInDetail ? item.accessories : undefined })) })) : filtered;
  }, [allSections, filterEnabled, searchText, keepOrder, isShowingDetail, keepAccessoriesInDetail]);

  const [selectedId, setSelectedId] = useState<string | null>(selectedItemId ?? null);
  const lastQuery = useRef(searchText);
  const onSelectionChangeRef = useLatest(onSelectionChange);

  useEffect(() => {
    if (selectedItemId !== undefined) setSelectedId(selectedItemId);
  }, [selectedItemId]);

  // A new query selects the first result.
  if (lastQuery.current !== searchText) {
    lastQuery.current = searchText;
    const first = sections.find((s) => s.items.length)?.items[0]?.id ?? null;
    if (first !== selectedId) setSelectedId(first);
  }

  const changeSelection = useCallback((id: string | null) => setSelectedId(id), []);

  // Report every selection change (keyboard, mouse, filtering, reconciliation) once.
  const notified = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (notified.current === selectedId) return;
    const first = notified.current === undefined;
    notified.current = selectedId;
    if (!first || selectedId !== null) onSelectionChangeRef.current?.(selectedId);
  }, [selectedId, onSelectionChangeRef]);

  const selectedItem = useMemo(() => {
    for (const s of sections) for (const item of s.items) if (item.id === selectedId) return item;
    return undefined;
  }, [sections, selectedId]);

  const isEmpty = !sections.some((s) => s.items.length > 0);
  const registered = useRegisterActions(isEmpty ? (emptyView?.actions ?? actions) : (selectedItem?.actions ?? actions));
  const emptyPrimary = isEmpty ? primaryActions(registered).primary : undefined;

  const activate = useCallback(
    (item: ListItemModel) => {
      const model = collectActions(item.actions ?? actions, actionContext);
      const { primary } = primaryActions(model);
      if (primary) view?.runAction(primary);
    },
    [actions, actionContext, view],
  );

  const loadedFor = useRef(-1);
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const onNearEnd = pagination?.hasMore
    ? () => {
        if (isLoading || loadedFor.current === total) return;
        loadedFor.current = total;
        pagination.onLoadMore();
      }
    : undefined;

  const empty =
    isEmpty && !isLoading ? (
      <EmptyListView emptyView={emptyView} searching={Boolean(searchText)} action={emptyPrimary && view ? { title: emptyPrimary.title, onAction: () => view.runAction(emptyPrimary) } : undefined} />
    ) : null;
  const listBox = (
    <ListBox sections={sections} selectedId={selectedId} onSelectedIdChange={changeSelection} onActivate={activate} size={size} emptyView={empty} onNearEnd={onNearEnd} aria-label="Results" />
  );

  if (!isShowingDetail) return listBox;
  const detail = selectedItem?.detail;
  const detailProps = isValidElement(detail) && detail.type === ListItemDetail ? (detail.props as ItemDetailProps) : null;
  return (
    <div className="sc-list-split" style={detailWidth === "small" ? ({ "--detail-width": "var(--detail-width-small)" } as CSSProperties) : undefined}>
      <div className="sc-list-split__master">{listBox}</div>
      <div className="sc-list-split__detail">{detailProps ? <ItemDetail {...detailProps} /> : isValidElement(detail) ? (detail as ReactElement) : null}</div>
    </div>
  );
}

function EmptyListView({ emptyView, searching, action }: { emptyView: EmptyViewMarkerProps | null; searching: boolean; action?: { title: string; onAction: () => void } }) {
  if (emptyView) return <EmptyView title={emptyView.title} description={emptyView.description} icon={emptyView.icon} action={action} />;
  return <EmptyView title={searching ? "No Results" : "No Items"} action={action} />;
}

List.Item = Object.assign(ListItem, { Detail: Object.assign(ListItemDetail, {}) });
List.Section = ListSection;
List.EmptyView = ListEmptyView;
List.Dropdown = ListDropdown;
