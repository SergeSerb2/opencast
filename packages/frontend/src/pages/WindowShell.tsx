import { EmptyView } from "../components/EmptyView/EmptyView";
import { FloatingToastHost } from "../components/Toast/InlineToast";
import "./window-shell.css";

/**
 * Frame for the secondary windows (AI Chat, Notes, Settings) until their
 * owning feature mounts its own UI: theme, toasts and an empty state.
 */
export function WindowShell({ title }: { title: string }) {
  return (
    <main className="sc-window-shell" aria-label={title}>
      <EmptyView title={title} description="Opening…" icon={null} />
      <FloatingToastHost />
    </main>
  );
}
