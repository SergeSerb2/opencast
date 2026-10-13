import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ScrollArea, type ScrollEdges } from "./ScrollArea";

export interface VirtualListHandle {
  /** Bring rows `[from, index]` into view (from defaults to index) respecting the scroll paddings. */
  scrollToIndex(index: number, align?: "auto" | "center" | "start", from?: number): void;
  /** Number of rows of the given height that fit between the scroll paddings. */
  pageSize(rowHeight: number): number;
  readonly element: HTMLDivElement | null;
}

export interface VirtualListProps {
  /** Height of every row in px (headers, items, spacers). */
  heights: readonly number[];
  rowKey: (index: number) => string;
  renderRow: (index: number, style: CSSProperties) => ReactNode;
  paddingTop?: number;
  paddingBottom?: number;
  /** Space kept clear when revealing a row (overlaid header/footer). */
  scrollPaddingStart?: number;
  scrollPaddingEnd?: number;
  overscan?: number;
  fade?: ScrollEdges;
  thumbInset?: ScrollEdges;
  className?: string;
  /** Scroll position changes (e.g. to compute which rows are visible). */
  onScrollTop?: (scrollTop: number) => void;
  role?: string;
  id?: string;
  "aria-label"?: string;
  "aria-activedescendant"?: string;
}

function lowerBound(offsets: Float64Array, value: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Windowed list of fixed-height rows (variable per row). Renders only visible rows ± overscan. */
export const VirtualList = forwardRef<VirtualListHandle, VirtualListProps>(function VirtualList(
  { heights, rowKey, renderRow, paddingTop = 0, paddingBottom = 0, scrollPaddingStart = 0, scrollPaddingEnd = 0, overscan = 5, fade, thumbInset, className, onScrollTop, ...aria },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState({ scrollTop: 0, clientHeight: 0 });

  const offsets = useMemo(() => {
    const out = new Float64Array(heights.length + 1);
    for (let i = 0; i < heights.length; i++) out[i + 1] = out[i] + heights[i];
    return out;
  }, [heights]);
  const total = offsets[heights.length];

  const onScrollTopRef = useRef(onScrollTop);
  onScrollTopRef.current = onScrollTop;
  const onMetrics = useCallback((m: { scrollTop: number; clientHeight: number }) => {
    setMetrics((prev) => (prev.scrollTop === m.scrollTop && prev.clientHeight === m.clientHeight ? prev : { scrollTop: m.scrollTop, clientHeight: m.clientHeight }));
    onScrollTopRef.current?.(m.scrollTop);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      get element() {
        return viewportRef.current;
      },
      pageSize(rowHeight: number) {
        const viewport = viewportRef.current;
        if (!viewport || rowHeight <= 0) return 1;
        return Math.max(1, Math.floor((viewport.clientHeight - scrollPaddingStart - scrollPaddingEnd) / rowHeight));
      },
      scrollToIndex(index, align = "auto", from = index) {
        const viewport = viewportRef.current;
        if (!viewport || index < 0 || index >= heights.length) return;
        const top = paddingTop + offsets[Math.max(0, Math.min(from, index))];
        const bottom = paddingTop + offsets[index + 1];
        const view = viewport.clientHeight;
        let next = viewport.scrollTop;
        if (align === "center") next = (top + bottom) / 2 - view / 2;
        else if (align === "start") next = top - scrollPaddingStart;
        else if (top < viewport.scrollTop + scrollPaddingStart) next = top - scrollPaddingStart;
        else if (bottom > viewport.scrollTop + view - scrollPaddingEnd) next = bottom - view + scrollPaddingEnd;
        // The first row should sit at the list's own top padding, not under the header.
        if (from === 0 || index === 0) next = Math.min(next, 0);
        if (next !== viewport.scrollTop) viewport.scrollTop = Math.max(0, next);
      },
    }),
    [heights.length, offsets, paddingTop, scrollPaddingStart, scrollPaddingEnd],
  );

  const viewTop = metrics.scrollTop - paddingTop;
  const viewBottom = viewTop + (metrics.clientHeight || 800);
  const first = heights.length ? Math.max(0, lowerBound(offsets, Math.max(0, viewTop)) - overscan) : 0;
  const last = heights.length ? Math.min(heights.length - 1, lowerBound(offsets, Math.max(0, viewBottom)) + overscan) : -1;

  const rows: ReactNode[] = [];
  for (let i = first; i <= last; i++) {
    rows.push(
      <div key={rowKey(i)} className="sc-virtual-row" style={{ position: "absolute", top: paddingTop + offsets[i], left: 0, right: 0, height: heights[i] }}>
        {renderRow(i, { height: heights[i] })}
      </div>,
    );
  }

  return (
    <ScrollArea ref={viewportRef} className={className} fade={fade} thumbInset={thumbInset} onMetrics={onMetrics} {...aria}>
      <div className="sc-virtual-list" style={{ position: "relative", height: paddingTop + total + paddingBottom }}>
        {rows}
      </div>
    </ScrollArea>
  );
});
