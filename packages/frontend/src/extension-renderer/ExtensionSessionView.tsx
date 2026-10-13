import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExtensionSessionState, HandlerRef, ImageLike, UINode } from "@surgecast/protocol";
import { backend } from "../bridge/backend";
import { errorMessage, isCancelled } from "../bridge/errors";
import { useEvent } from "../bridge/hooks";
import { List } from "../components/List/List";
import { NavigationContext, type NavigationApi } from "../components/View/contexts";
import { showToast } from "../components/feedback/toast-store";
import { renderExtensionRoot } from "./ExtensionViews";
import "./extension-session.css";

export interface ExtensionSessionViewProps {
  sessionId: string;
  title?: string;
  icon?: ImageLike;
}

interface Layer {
  depth: number;
  root: UINode;
  isLoading: boolean;
  navigationTitle?: string;
}

/** Keep one layer per extension navigation depth so popping restores selection and search text. */
export function nextLayers(layers: Layer[], state: ExtensionSessionState): Layer[] {
  if (!state.root) return layers;
  const kept = layers.filter((l) => l.depth < state.depth);
  return [...kept, { depth: state.depth, root: state.root, isLoading: state.isLoading, navigationTitle: state.navigationTitle }];
}

/**
 * Renders an extension session's UINode trees (`ext.session.updated`) and
 * dispatches handlers back to the runtime. Lower navigation levels stay
 * mounted (hidden) like the runtime's own stack; Esc is routed to
 * `ext.session.pop` by the launcher's navigation for this entry.
 */
export function ExtensionSessionView({ sessionId, title, icon }: ExtensionSessionViewProps) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const parent = useContext(NavigationContext);

  const apply = useCallback(
    (state: ExtensionSessionState) => {
      if (state.sessionId !== sessionId) return;
      setLayers((prev) => nextLayers(prev, state));
    },
    [sessionId],
  );

  useEvent("ext.session.updated", apply);

  // The first update may have been sent before this view subscribed.
  useEffect(() => {
    let cancelled = false;
    backend
      .call("ext.session.state", { sessionId })
      .then((current) => {
        if (!cancelled && current) setLayers((prev) => (prev.length ? prev : nextLayers(prev, current)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const dispatch = useCallback(
    (handler: HandlerRef, args: unknown[] = []) => {
      backend.call("ext.session.dispatch", { sessionId, handlerId: handler.$handler, args }).catch((error: unknown) => {
        if (!isCancelled(error)) showToast({ style: "failure", title: "Extension error", message: errorMessage(error) });
      });
    },
    [sessionId],
  );

  if (!layers.length) {
    // Loading: an empty list with the header loading line while the command starts.
    return <List isLoading navigationTitle={title} navigationIcon={icon} filtering={false} />;
  }
  const top = layers[layers.length - 1];
  return (
    <>
      {layers.map((layer) => (
        <SessionLayer key={layer.depth} layer={layer} active={layer === top} parent={parent} title={title} icon={icon} dispatch={dispatch} />
      ))}
    </>
  );
}

function SessionLayer({ layer, active, parent, title, icon, dispatch }: { layer: Layer; active: boolean; parent: NavigationApi | null; title?: string; icon?: ImageLike; dispatch: (h: HandlerRef, a?: unknown[]) => void }) {
  const navigation = useMemo<NavigationApi | null>(() => (parent ? { ...parent, isActive: parent.isActive && active } : null), [parent, active]);
  const content = renderExtensionRoot(layer.root, { dispatch, isLoading: layer.isLoading, navigationTitle: layer.navigationTitle ?? title, navigationIcon: icon });
  return (
    <div className="sc-extension-layer" data-active={active || undefined}>
      {navigation ? <NavigationContext.Provider value={navigation}>{content}</NavigationContext.Provider> : content}
    </div>
  );
}
