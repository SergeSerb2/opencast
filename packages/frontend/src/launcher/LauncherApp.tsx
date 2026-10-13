import { useMemo, useState, type ReactNode } from "react";
import { NavigationContext, type NavigationApi } from "../components/View/contexts";
import { ViewFrame } from "../components/View/ViewFrame";
import { EmptyView } from "../components/EmptyView/EmptyView";
import { ExtensionSessionView } from "../extension-renderer/ExtensionSessionView";
import { backend } from "../bridge/backend";
import { getSetting } from "../bridge/settings";
import { hideLauncher } from "./launch";
import { useNavigationStore, type NavEntry } from "./navigation";
import { RootSearch } from "./root/RootSearch";
import { useLauncherBehavior } from "./useLauncherBehavior";
import { getView } from "./views/registry";
import "./views";
import "./launcher.css";

function UnavailableView({ id, title }: { id: string; title?: string }) {
  return (
    <ViewFrame navigationTitle={title}>
      <EmptyView title="View Unavailable" description={`No view is registered for “${id}”.`} icon="warning-16" />
    </ViewFrame>
  );
}

function renderEntry(entry: NavEntry): ReactNode {
  switch (entry.kind) {
    case "root":
      return <RootSearch />;
    case "element":
      return entry.element;
    case "extension":
      return <ExtensionSessionView sessionId={entry.sessionId} title={entry.title} icon={entry.icon} />;
    case "builtin": {
      const View = getView(entry.view.id);
      return View ? <View props={entry.view.props ?? {}} title={entry.title ?? entry.view.title} icon={entry.icon} commandId={entry.commandId} view={entry.view} /> : <UnavailableView id={entry.view.id} title={entry.title} />;
    }
    case "quick-ai": {
      const View = getView("quick-ai");
      const view = { id: "quick-ai", title: entry.title, props: { prompt: entry.prompt, aiCommandId: entry.aiCommandId, presetId: entry.presetId } };
      return View ? <View props={view.props} title={entry.title} icon={entry.icon} commandId={entry.commandId} view={view} /> : <UnavailableView id="quick-ai" title={entry.title} />;
    }
  }
}

/** One stack entry with its own navigation API (extension entries pop through the runtime). */
function StackEntry({ entry, depth, active }: { entry: NavEntry; depth: number; active: boolean }) {
  const store = useNavigationStore;
  const api: NavigationApi = useMemo<NavigationApi>(
    () => ({
      depth,
      isActive: active,
      push: (element, options) => store.getState().push({ kind: "element", element, title: options?.title }),
      popToRoot: () => store.getState().popToRoot(),
      escape: () => {
        if (getSetting("keyboard.escapeKeyBehavior") === "close-window") hideLauncher();
        else api.pop();
      },
      pop: () => {
        if (entry.kind === "extension") {
          backend
            .call("ext.session.pop", { sessionId: entry.sessionId })
            .then(({ closed }) => closed && store.getState().remove(entry.key, { sessionClosed: true }))
            .catch(() => store.getState().remove(entry.key, { sessionClosed: true }));
          return;
        }
        store.getState().pop();
      },
    }),
    [depth, active, entry, store],
  );
  return (
    <div className="sc-launcher-entry" data-active={active || undefined}>
      <NavigationContext.Provider value={api}>{renderEntry(entry)}</NavigationContext.Provider>
    </div>
  );
}

/** Launcher window (main.html): navigation stack over root search plus window behavior. */
export function LauncherApp() {
  const stack = useNavigationStore((s) => s.stack);
  const [visible, setVisible] = useState(true);
  useLauncherBehavior(setVisible);
  const topIndex = stack.length - 1;

  return (
    <div className="sc-launcher sc-launcher-scope" onContextMenu={(e) => getComputedStyle(e.target as Element).userSelect === "none" && e.preventDefault()}>
      {stack.map((entry, index) => (
        <StackEntry key={entry.key} entry={entry} depth={index} active={visible && index === topIndex} />
      ))}
    </div>
  );
}
