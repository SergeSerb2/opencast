import { createContext, useContext, type ReactNode } from "react";
import type { ActionModel, ActionPanelModel } from "../actions/model";

/** Navigation inside the launcher window. Provided by the launcher; absent in other windows. */
export interface NavigationApi {
  /** Push a React element as a new view. */
  push: (view: ReactNode, options?: { title?: string }) => void;
  pop: () => void;
  popToRoot: () => void;
  /** Number of views above root search (0 = root). */
  depth: number;
  /** True when this view is the visible top of the stack. */
  isActive: boolean;
}

export const NavigationContext = createContext<NavigationApi | null>(null);

export function useNavigation(): NavigationApi {
  return (
    useContext(NavigationContext) ?? {
      push: () => console.warn("[surgecast] push() outside the launcher navigation"),
      pop: () => undefined,
      popToRoot: () => undefined,
      depth: 0,
      isActive: true,
    }
  );
}

/** Returns true when it handled the event (stops further processing). */
export type ViewKeyHandler = (event: KeyboardEvent) => boolean;

/** API a view's content uses to talk to its frame (search bar, footer, action panel). */
export interface ViewController {
  isActive: boolean;
  /** Register the actions for the current selection (null clears). */
  setActions: (model: ActionPanelModel | null) => void;
  runAction: (action: ActionModel) => void;
  openActions: () => void;
  closeActions: () => void;
  isActionPanelOpen: boolean;
  focusSearch: () => void;
  /** Content keyboard handling (list/grid navigation) runs before the frame's shortcuts. */
  registerKeyHandler: (handler: ViewKeyHandler) => () => void;
  /** Ids for aria wiring between the search input and the list. */
  listId: string;
  setActiveDescendant: (id: string | undefined) => void;
}

export const ViewContext = createContext<ViewController | null>(null);

export function useViewController(): ViewController {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useViewController must be used inside <ViewFrame>");
  return ctx;
}

export function useOptionalViewController(): ViewController | null {
  return useContext(ViewContext);
}
