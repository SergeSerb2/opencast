import { useEffect, useRef, useState } from "react";
import { Icon } from "../../icons/Icon";
import { Menu } from "../Menu/Menu";
import { Popover } from "../Popover/Popover";
import { ActivityIndicator } from "../Spinner/Spinner";
import { hideToast, showFailureToast, type ActiveToast } from "../feedback/toast-store";

const AUTO_HIDE_MS = 3000;
const FADE_MS = 200;

/**
 * Toast in the footer's left slot: status dot (or ring while pending), title
 * and message on one 12px line, a colored wash, hover reveals ×. Non-pending
 * toasts fade after 3s unless hovered. Actions open as a menu.
 */
export function FooterToast({ toast }: { toast: ActiveToast }) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [fading, setFading] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const hasActions = Boolean(toast.primaryAction || toast.secondaryAction);

  useEffect(() => {
    setFading(false);
    if (toast.style === "animated" || hovered || menuOpen) return;
    const fade = setTimeout(() => setFading(true), AUTO_HIDE_MS);
    const hide = setTimeout(() => hideToast(toast.id), AUTO_HIDE_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [toast.id, toast.revision, toast.style, hovered, menuOpen]);

  const state = toast.style === "animated" ? "pending" : toast.style === "failure" ? "failure" : "success";

  const run = async (action: NonNullable<ActiveToast["primaryAction"]>) => {
    setMenuOpen(false);
    try {
      await action.onAction();
    } catch (error) {
      showFailureToast("Action failed", error);
    }
  };

  return (
    <div
      ref={pillRef}
      className="sc-footer__pill sc-glass-control sc-footer-toast"
      data-style={toast.style}
      data-fading={fading || undefined}
      data-menu-open={menuOpen || undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="sc-footer-toast__wash" aria-hidden="true" />
      <button
        type="button"
        className="sc-action-button sc-footer-toast__button"
        data-variant="primary"
        data-hover-variant="outset"
        data-state={menuOpen ? "open" : undefined}
        role="status"
        aria-live="polite"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => hasActions && setMenuOpen(true)}
      >
        <span className="sc-footer-toast__status" data-hidden={hovered || undefined}>
          <ActivityIndicator state={state} />
        </span>
        <span className="sc-action-button__title sc-footer-toast__title">{toast.title}</span>
        {toast.message && <span className="sc-action-button__subtitle sc-footer-toast__message">{toast.message}</span>}
      </button>
      <button
        type="button"
        className="sc-footer-toast__dismiss"
        data-visible={hovered || undefined}
        aria-label="Dismiss"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => hideToast(toast.id)}
      >
        <Icon name="xmark-16" size={12} />
      </button>
      <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchor={(root) => ({ x: 8, y: root.height - 8 })} side="top" align="start" offset={0} width={350}>
        <Menu
          title={toast.message ? `${toast.title} — ${toast.message}` : toast.title}
          showSearch={false}
          sections={[
            {
              items: (["primary", "secondary"] as const).flatMap((slot) => {
                const action = slot === "primary" ? toast.primaryAction : toast.secondaryAction;
                return action ? [{ id: slot, title: action.title, shortcut: action.shortcut }] : [];
              }),
            },
          ]}
          onSelect={(item) => {
            const action = item.id === "primary" ? toast.primaryAction : toast.secondaryAction;
            if (action) void run(action);
          }}
          onDismiss={() => setMenuOpen(false)}
        />
      </Popover>
    </div>
  );
}
