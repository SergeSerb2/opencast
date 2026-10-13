import type { ImageLike } from "@opencast/protocol";
import { errorMessage } from "../../../bridge/errors";
import { useBackend } from "../../../bridge/hooks";
import { EmptyView, ViewFrame } from "../../../components";
import { sc } from "../../../lib/keyboard";
import type { LauncherViewProps } from "../registry";
import { WindowLayoutEditor, type LayoutTemplate } from "./WindowLayoutEditor";
import { WindowLayoutsList } from "./WindowLayoutsList";

export interface WindowManagementProps {
  /** "create" opens the editor (Create Window Management Command). */
  action?: string;
  /** Edit the saved command with this id. */
  id?: string;
  /** Prefill (or, with an id, edit) a layout. */
  layout?: LayoutTemplate;
}

/**
 * `window-management` (saved commands, or the editor with `action: "create"`)
 * and `window-management.create` (editor; `id` or `layout` to edit/prefill).
 */
export function WindowManagementView({ props, title, icon, view }: LauncherViewProps<WindowManagementProps>) {
  const editorRequested = view.id === "window-management.create" || props.action === "create" || Boolean(props.id);
  if (!editorRequested) return <WindowLayoutsList navigationTitle={title ?? "Window Commands"} navigationIcon={icon} />;
  if (props.id && !props.layout?.rect) return <EditSavedLayout id={props.id} navigationIcon={icon} />;
  const editing = Boolean(props.layout?.id);
  return <WindowLayoutEditor layout={props.layout} navigationTitle={editing ? undefined : title} navigationIcon={icon} />;
}

function EditSavedLayout({ id, navigationIcon }: { id: string; navigationIcon?: ImageLike }) {
  const { data, error, isLoading, refetch } = useBackend("windows.layouts.list", undefined);
  const layout = data?.find((l) => l.id === id);
  if (layout) return <WindowLayoutEditor key={layout.id} layout={layout} navigationIcon={navigationIcon} />;
  return (
    <ViewFrame navigationTitle="Edit Window Command" navigationIcon={navigationIcon} isLoading={isLoading} actions={error ? { sections: [{ actions: [{ id: "retry", title: "Try Again", shortcut: sc("cmd", "r"), onAction: refetch }] }] } : undefined}>
      {!isLoading && <EmptyView title={error ? "Could Not Load Window Command" : "Window Command Not Found"} description={error ? errorMessage(error) : "It may have been deleted on this or another device."} />}
    </ViewFrame>
  );
}
