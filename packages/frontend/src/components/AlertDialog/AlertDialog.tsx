import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { AlertOptions } from "@opencast/protocol";
import { Image } from "../../icons/Image";
import { OpenCastLogo } from "../../icons/glyphs";
import { useAlertStore } from "../feedback/alert-store";
import "./alert-dialog.css";

export interface AlertDialogProps {
  options: AlertOptions;
  onResult: (confirmed: boolean) => void;
}

/** confirmAlert-style sheet centered over the window; ↵ confirms, Esc dismisses. */
export function AlertDialog({ options, onResult }: AlertDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const primary = options.primaryAction ?? { title: "OK", style: "default" as const };
  const dismiss = options.dismissAction ?? { title: "Cancel", style: "cancel" as const };

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onResult(false);
      } else if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
        event.stopImmediatePropagation();
        // A focused button answers through its own click (Cancel stays Cancel).
        if ((document.activeElement as HTMLElement | null)?.closest(".sc-alert__button")) return;
        event.preventDefault();
        onResult(true);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onResult]);

  const root = document.getElementById("sc-overlay-root") ?? document.body;
  return createPortal(
    <div className="sc-alert-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onResult(false)}>
      <div className="sc-alert sc-glass-panel" role="alertdialog" aria-modal="true" aria-labelledby="sc-alert-title" aria-describedby={options.message ? "sc-alert-message" : undefined}>
        <div className="sc-alert__icon">{options.icon ? <Image source={options.icon} size={48} /> : <OpenCastLogo size={44} />}</div>
        <div id="sc-alert-title" className="sc-alert__title">
          {options.title}
        </div>
        {options.message && (
          <div id="sc-alert-message" className="sc-alert__message">
            {options.message}
          </div>
        )}
        <div className="sc-alert__buttons">
          <button type="button" className="sc-alert__button" data-style={dismiss.style ?? "cancel"} onClick={() => onResult(false)}>
            {dismiss.title}
          </button>
          <button ref={primaryRef} type="button" className="sc-alert__button" data-style={primary.style ?? "default"} data-primary onClick={() => onResult(true)}>
            {primary.title}
          </button>
        </div>
      </div>
    </div>,
    root,
  );
}

/** Renders the pending `confirmAlert` (mount once per window). */
export function AlertHost() {
  const alert = useAlertStore((state) => state.alert);
  if (!alert) return null;
  return <AlertDialog key={alert.id} options={alert.options} onResult={alert.resolve} />;
}
