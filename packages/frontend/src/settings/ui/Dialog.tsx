import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./dialog.css";

export interface DialogProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Right-aligned footer buttons (Cancel ghost, primary default). */
  footer?: ReactNode;
  width?: number;
  /** Accessible description id inside the body. */
  "aria-describedby"?: string;
}

/**
 * Modal sheet for settings sub-forms (§8.5): 400px wide, radius 20, 64px
 * header, 24px body padding, 56px footer with a hairline. Esc closes; the
 * first field receives focus.
 */
export function Dialog({ title, onClose, children, footer, width = 400, ...aria }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const panel = panelRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.querySelector<HTMLElement>(".sc-s-window");
    const wasInert = background?.inert ?? false;
    if (background) background.inert = true;
    const first = panel?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), [data-autofocus]");
    (first ?? panel)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      // Let an open popover/menu inside the dialog handle Esc first.
      if (document.querySelector(".sc-popover[data-state='open']")) return;
      if (event.key === "Tab") {
        const focusable = [...(panel?.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex="0"]') ?? [])].filter((el) => !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (background) background.inert = wasInert;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  const root = document.getElementById("sc-overlay-root") ?? document.body;
  return createPortal(
    <div className="sc-s-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className="sc-s-dialog sc-glass-panel" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1} style={{ width }} {...aria}>
        <div className="sc-s-dialog__header">{title}</div>
        <div className="sc-s-dialog__body">{children}</div>
        {footer && <div className="sc-s-dialog__footer">{footer}</div>}
      </div>
    </div>,
    root,
  );
}

/** Label + field stack used inside dialogs. */
export function DialogField({ label, hint, error, children }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="sc-s-dialog-field" data-invalid={error ? "" : undefined}>
      <span className="sc-s-dialog-field__label">{label}</span>
      {children}
      {error ? <span className="sc-s-dialog-field__error">{error}</span> : hint && <span className="sc-s-dialog-field__hint">{hint}</span>}
    </label>
  );
}
