import { memo } from "react";
import "./spinner.css";

/** Eight-leaf spinner, 16px by default (§5.8). */
export const Spinner = memo(function Spinner({ size = 16, label = "Loading" }: { size?: number; label?: string }) {
  return (
    <span className="sc-spinner" style={{ width: size, height: size }} role="progressbar" aria-label={label}>
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="sc-spinner__leaf" style={{ transform: `rotate(${i * 45}deg)`, animationDelay: `${(i - 8) * 100}ms` }} />
      ))}
    </span>
  );
});

export type ActivityState = "pending" | "success" | "warning" | "failure";

/**
 * Ring that cycles while pending and morphs into a glowing colored dot when
 * done (toasts, HUD, tool status).
 */
export const ActivityIndicator = memo(function ActivityIndicator({ state, size = 16 }: { state: ActivityState; size?: number }) {
  return (
    <span className="sc-activity" data-state={state} style={{ width: size, height: size }} role="status" aria-label={state === "pending" ? "In progress" : state}>
      <svg className="sc-activity__ring" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
        <circle className="sc-activity__track" cx="8" cy="8" r="6.25" />
        <circle className="sc-activity__arc" cx="8" cy="8" r="6.25" pathLength="100" />
      </svg>
      <span className="sc-activity__dot" />
    </span>
  );
});

/**
 * The header's loading line: six stacked 1px glows sweeping ±35%, visible
 * after `loading` has been true for 300ms (§3.2).
 */
export const LoadingBar = memo(function LoadingBar({ loading, delay = 300 }: { loading: boolean; delay?: number }) {
  return (
    <div className="sc-loading-bar" data-loading={loading || undefined} style={{ ["--loading-delay" as string]: `${delay}ms` }} aria-hidden="true">
      {[10, 8, 6, 4, 2, 0].map((blur) => (
        <span key={blur} className="sc-loading-bar__line" style={{ filter: blur ? `blur(${blur}px)` : undefined }} />
      ))}
    </div>
  );
});
