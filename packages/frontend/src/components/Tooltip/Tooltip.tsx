import { cloneElement, isValidElement, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./tooltip.css";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
  /** Delay before showing on hover (spec: 200ms). */
  delay?: number;
  side?: "top" | "bottom";
  tone?: "default" | "error";
}

let lastClosedAt = 0;

/** Hover tooltip (11px, max 300px, 200ms dwell, 50ms when another tooltip was just open). */
export function Tooltip({ content, children, delay = 200, side = "top", tone = "default" }: TooltipProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef<HTMLElement | null>(null);

  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Keep the tooltip inside the window (buttons near an edge would push it out).
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!rect || !tooltip) return;
    const root = (document.getElementById("sc-overlay-root") ?? document.body).getBoundingClientRect();
    const half = tooltip.offsetWidth / 2;
    const center = rect.left - root.left + rect.width / 2;
    tooltip.style.left = `${Math.min(Math.max(center, half + 8), root.width - half - 8)}px`;
  }, [rect]);

  if (!content || !isValidElement(children)) return children;

  const show = (element: HTMLElement) => {
    target.current = element;
    const wait = Date.now() - lastClosedAt < 700 ? 50 : delay;
    timer.current = setTimeout(() => setRect(element.getBoundingClientRect()), wait);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    if (rect) lastClosedAt = Date.now();
    setRect(null);
  };

  const childProps = children.props as { onMouseEnter?: (e: ReactMouseEvent<HTMLElement>) => void; onMouseLeave?: (e: ReactMouseEvent<HTMLElement>) => void };
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e);
      show(e.currentTarget);
    },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e);
      hide();
    },
  });

  const root = document.getElementById("sc-overlay-root") ?? document.body;
  const rootRect = root.getBoundingClientRect();
  return (
    <>
      {trigger}
      {rect &&
        createPortal(
          <div
            ref={tooltipRef}
            className="sc-tooltip"
            data-side={side}
            data-tone={tone}
            role="tooltip"
            style={{
              left: rect.left - rootRect.left + rect.width / 2,
              ...(side === "top" ? { bottom: rootRect.bottom - rect.top + 6 } : { top: rect.bottom - rootRect.top + 6 }),
            }}
          >
            {content}
          </div>,
          root,
        )}
    </>
  );
}
