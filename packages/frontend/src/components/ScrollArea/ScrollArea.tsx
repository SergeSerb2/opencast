import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type UIEvent } from "react";
import "./scroll-area.css";

export interface ScrollEdges {
  /** Fade height in px at the top edge (0 disables). */
  top?: number;
  bottom?: number;
}

export interface ScrollAreaProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Edge fades whose strength grows with the distance scrolled (§3.3). */
  fade?: ScrollEdges;
  /** Lowest midpoint opacity of the fades (top 0.15, bottom 0.25 per spec). */
  fadeMinOpacity?: ScrollEdges;
  /** Keep the custom scroll thumb clear of overlaid chrome (header/footer). */
  thumbInset?: ScrollEdges;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  /** Called with the scroll metrics on scroll and resize (used by VirtualList). */
  onMetrics?: (metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }) => void;
  role?: string;
  id?: string;
  tabIndex?: number;
  "aria-label"?: string;
  "aria-activedescendant"?: string;
}

/**
 * Scroll container with hidden native scrollbars, an overlay thumb (6px,
 * 11px on hover), and scroll-driven edge fades.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, className, style, fade, fadeMinOpacity, thumbInset, onScroll, onMetrics, ...aria },
  ref,
) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frame = useRef<number | null>(null);
  useImperativeHandle(ref, () => viewportRef.current as HTMLDivElement);

  const fadeTop = fade?.top ?? 0;
  const fadeBottom = fade?.bottom ?? 0;
  const insetTop = thumbInset?.top ?? 0;
  const insetBottom = thumbInset?.bottom ?? 0;

  const update = useCallback(
    (reveal: boolean) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const { scrollTop, clientHeight, scrollHeight } = viewport;
      const maxScroll = Math.max(0, scrollHeight - clientHeight);
      if (fadeTop) viewport.style.setProperty("--fade-top-strength", String(Math.min(1, scrollTop / fadeTop)));
      if (fadeBottom) viewport.style.setProperty("--fade-bottom-strength", String(Math.min(1, (maxScroll - scrollTop) / fadeBottom)));
      const thumb = thumbRef.current;
      const track = trackRef.current;
      if (thumb && track) {
        const trackHeight = clientHeight - insetTop - insetBottom;
        const scrollable = maxScroll > 1 && trackHeight > 24;
        track.dataset.scrollable = String(scrollable);
        if (scrollable) {
          const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
          const offset = (scrollTop / maxScroll) * (trackHeight - thumbHeight);
          thumb.style.height = `${thumbHeight}px`;
          thumb.style.transform = `translateY(${offset}px)`;
          if (reveal) {
            track.dataset.visible = "true";
            if (hideTimer.current) clearTimeout(hideTimer.current);
            hideTimer.current = setTimeout(() => {
              if (trackRef.current && trackRef.current.dataset.dragging !== "true") trackRef.current.dataset.visible = "false";
            }, 1000);
          }
        }
      }
      onMetrics?.({ scrollTop, clientHeight, scrollHeight });
    },
    [fadeTop, fadeBottom, insetTop, insetBottom, onMetrics],
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    onScroll?.(event);
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      update(true);
    });
  };

  useLayoutEffect(() => update(false));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => update(false));
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    return () => {
      observer.disconnect();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [update]);

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    event.preventDefault();
    const startY = event.clientY;
    const startTop = viewport.scrollTop;
    const trackHeight = viewport.clientHeight - insetTop - insetBottom;
    const ratio = viewport.scrollHeight / Math.max(1, trackHeight);
    track.dataset.dragging = "true";
    const move = (e: PointerEvent) => {
      viewport.scrollTop = startTop + (e.clientY - startY) * ratio;
    };
    const up = () => {
      track.dataset.dragging = "false";
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      update(true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const viewportStyle = {
    ...style,
    "--fade-top": `${fadeTop}px`,
    "--fade-bottom": `${fadeBottom}px`,
    "--fade-top-min": String(fadeMinOpacity?.top ?? 0.15),
    "--fade-bottom-min": String(fadeMinOpacity?.bottom ?? 0.25),
  } as CSSProperties;

  return (
    <div className={`sc-scroll-area${className ? ` ${className}` : ""}`}>
      <div
        ref={viewportRef}
        className="sc-scroll-area__viewport sc-no-scrollbar"
        data-fade-top={fadeTop > 0 || undefined}
        data-fade-bottom={fadeBottom > 0 || undefined}
        style={viewportStyle}
        onScroll={handleScroll}
        {...aria}
      >
        {children}
      </div>
      <div ref={trackRef} className="sc-scroll-area__track" style={{ top: insetTop, bottom: insetBottom }} data-visible="false" data-scrollable="false" aria-hidden="true">
        <div ref={thumbRef} className="sc-scroll-area__thumb" onPointerDown={onThumbPointerDown} />
      </div>
    </div>
  );
});
