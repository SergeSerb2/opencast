import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ToastStyle } from "@surgecast/protocol";
import { ActivityIndicator } from "../Spinner/Spinner";
import { hideToast, useToastStore } from "../feedback/toast-store";
import "./inline-toast.css";

export interface InlineToastProps {
  style: ToastStyle | "default";
  title: string;
  message?: string;
}

/** Floating in-window toast (§5.4): glass, radius 12, colored glow for success/failure. */
export function InlineToast({ style, title, message }: InlineToastProps) {
  const state = style === "animated" ? "pending" : style === "failure" ? "failure" : "success";
  return (
    <div className="sc-inline-toast sc-glass-panel" data-style={style} role="status" aria-live="polite">
      {style !== "default" && <ActivityIndicator state={state} />}
      <span className="sc-inline-toast__text">
        <span className="sc-inline-toast__title">{title}</span>
        {message && <span className="sc-inline-toast__message">{message}</span>}
      </span>
    </div>
  );
}

/**
 * Shows the window's current toast (from `showToast`) as a floating toast near
 * the top. Use in windows without the launcher footer (AI Chat, Notes, Settings).
 */
export function FloatingToastHost() {
  const toast = useToastStore((s) => s.toast);
  const [hovered, setHovered] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setFading(false);
    if (!toast || toast.style === "animated" || hovered) return;
    const fade = setTimeout(() => setFading(true), 3000);
    const hide = setTimeout(() => hideToast(toast.id), 3200);
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, [toast, hovered]);

  if (!toast) return null;
  const root = document.getElementById("sc-overlay-root") ?? document.body;
  return createPortal(
    <div className="sc-inline-toast-wrap" data-fading={fading || undefined} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <InlineToast key={toast.id} style={toast.style} title={toast.title} message={toast.message} />
    </div>,
    root,
  );
}
