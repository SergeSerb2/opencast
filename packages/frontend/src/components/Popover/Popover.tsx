import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./popover.css";

/** An element, a point relative to the overlay root, or a function of the overlay root's size. */
export type PopoverAnchor = HTMLElement | { x: number; y: number } | ((root: DOMRect) => { x: number; y: number });

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: PopoverAnchor | null;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  /** Gap between anchor and popover. */
  offset?: number;
  /** Shift along the alignment axis (negative grows the popover outwards, as Raycast's −4px). */
  alignOffset?: number;
  width?: number | "anchor";
  /** Flip to the other side when there is not enough room. */
  flip?: boolean;
  className?: string;
  /** Glass panel chrome (default) or bare. */
  chrome?: boolean;
  children: ReactNode | ((placement: { side: "top" | "bottom" }) => ReactNode);
  "aria-label"?: string;
  role?: string;
}

const OVERLAY_ID = "sc-overlay-root";

/** Layer that hosts popovers, menus and alerts inside the window bounds. */
export function OverlayRoot() {
  return <div id={OVERLAY_ID} className="sc-overlay-root" />;
}

function overlayRoot(): HTMLElement {
  return document.getElementById(OVERLAY_ID) ?? document.body;
}

/** Keep content mounted for the exit animation. */
export function usePresence(open: boolean, exitMs: number): { mounted: boolean; state: "open" | "closed" } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
  }, [open, exitMs]);
  return { mounted: open || mounted, state: open ? "open" : "closed" };
}

/**
 * Floating glass panel (radius 18, panel shadow) anchored to an element or a
 * point; outside mousedown closes it. Opens with the spec's 250ms overshoot.
 */
export function Popover({ open, onClose, anchor, side = "bottom", align = "start", offset = 8, alignOffset = 0, width, flip = true, className, chrome = true, children, ...aria }: PopoverProps) {
  const { mounted, state } = usePresence(open, 150);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ style: CSSProperties; side: "top" | "bottom" } | null>(null);

  useLayoutEffect(() => {
    if (!mounted || !anchor) return;
    const root = overlayRoot();
    const rootRect = root.getBoundingClientRect();
    let x: number;
    let top: number;
    let bottom: number;
    let anchorWidth = 0;
    if (anchor instanceof HTMLElement) {
      const r = anchor.getBoundingClientRect();
      anchorWidth = r.width;
      x = align === "start" ? r.left - rootRect.left : align === "end" ? r.right - rootRect.left : r.left - rootRect.left + r.width / 2;
      top = r.top - rootRect.top;
      bottom = r.bottom - rootRect.top;
    } else {
      const point = typeof anchor === "function" ? anchor(rootRect) : anchor;
      x = point.x;
      top = point.y;
      bottom = point.y;
    }
    const panel = panelRef.current;
    const panelHeight = panel?.offsetHeight ?? 0;
    let resolvedSide = side;
    if (flip) {
      if (side === "bottom" && bottom + offset + panelHeight > rootRect.height && top - offset - panelHeight >= 0) resolvedSide = "top";
      if (side === "top" && top - offset - panelHeight < 0 && bottom + offset + panelHeight <= rootRect.height) resolvedSide = "bottom";
    }
    const resolvedWidth = width === "anchor" ? anchorWidth - 2 * alignOffset : width;
    const style: CSSProperties = { width: resolvedWidth };
    if (resolvedSide === "bottom") style.top = bottom + offset;
    else style.bottom = rootRect.height - top + offset;
    if (align === "start") style.left = Math.max(4, x + alignOffset);
    else if (align === "end") style.right = Math.max(4, rootRect.width - x + alignOffset);
    else {
      style.left = x;
      style.transform = "translateX(-50%)";
    }
    setPosition((previous) => (previous && previous.side === resolvedSide && JSON.stringify(previous.style) === JSON.stringify(style) ? previous : { style, side: resolvedSide }));
  });

  if (!mounted) return null;
  const resolvedSide = position?.side ?? side;
  return createPortal(
    <>
      <div className="sc-popover-backdrop" onMouseDown={onClose} />
      <div
        ref={panelRef}
        className={`sc-popover${chrome ? " sc-glass-panel" : ""}${className ? ` ${className}` : ""}`}
        data-state={state}
        data-side={resolvedSide}
        data-align={align}
        style={{ ...position?.style, visibility: position ? undefined : "hidden" }}
        {...aria}
      >
        {typeof children === "function" ? children({ side: resolvedSide }) : children}
      </div>
    </>,
    overlayRoot(),
  );
}
