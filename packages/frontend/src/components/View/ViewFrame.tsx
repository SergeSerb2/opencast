import { useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type Ref } from "react";
import type { CommandArgument, ImageLike } from "@surgecast/protocol";
import { useLatest } from "../../bridge/hooks";
import { eventKey, matchesShortcut, sc } from "../../lib/keyboard";
import { ActionPanelPopover } from "../ActionPanel/ActionPanelPopover";
import { Footer } from "../Footer/Footer";
import { SearchBar, type SearchBarHandle } from "../SearchBar/SearchBar";
import { actionsWithShortcuts, primaryActions, type ActionModel, type ActionPanelModel } from "../actions/model";
import { showFailureToast } from "../feedback/toast-store";
import { NavigationContext, ViewContext, type ViewController, type ViewKeyHandler } from "./contexts";
import "./view.css";

export interface ViewSearchBar {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  args?: CommandArgument[];
  argValues?: Record<string, string>;
  onArgChange?: (name: string, value: string) => void;
}

export interface ViewFrameProps {
  /** Search field config; omit for views without a search input (Detail, Form). */
  searchBar?: ViewSearchBar;
  /** Replaces the search input with custom header content. */
  headerContent?: ReactNode;
  /** Right side of the header (dropdown accessory, Quick AI hint, link). */
  headerAccessory?: ReactNode;
  /** Header leading glyph; defaults to back when the view is pushed, logo at root. */
  leading?: "logo" | "back" | ImageLike | null;
  isLoading?: boolean;
  /** Left footer pill for pushed views. */
  navigationTitle?: string;
  navigationIcon?: ImageLike;
  /** Root search: the menu button in the left pill and its actions (⇧⌘K). */
  menu?: ActionPanelModel | null;
  /** View-level actions, used when the content has not registered any. */
  actions?: ActionPanelModel | null;
  /** Footer label for the primary action. */
  primaryActionTitle?: string;
  /** Forms run their primary action with ⌘↵. */
  primaryShortcut?: "enter" | "cmd-enter";
  /** Tab/Enter handling in the search input (root search: arguments, Quick AI). Return true when handled. */
  onSearchKeyDown?: (event: ReactKeyboardEvent<HTMLElement>, field: number) => boolean;
  /** Esc after the frame's own handling (action panel). Defaults to navigation pop. */
  onEscape?: () => void;
  footerCenter?: ReactNode;
  hideFooter?: boolean;
  /** Access to the search input and inline argument fields (focus, validation). */
  searchBarRef?: Ref<SearchBarHandle>;
  children: ReactNode;
  className?: string;
}

const CMD_K = sc("cmd", "k");
const SHIFT_CMD_K = sc("shift", "cmd", "k");

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
}

/**
 * The launcher view chrome: overlay header (search bar), full-height content
 * that scrolls under the header and footer, footer pills and the ⌘K action
 * panel. Content components (List, Grid, Detail, Form) register their current
 * actions and keyboard handlers through `ViewContext`.
 */
export function ViewFrame({
  searchBar,
  headerContent,
  headerAccessory,
  leading,
  isLoading = false,
  navigationTitle,
  navigationIcon,
  menu,
  actions,
  primaryActionTitle,
  primaryShortcut = "enter",
  onSearchKeyDown,
  onEscape,
  footerCenter,
  hideFooter = false,
  searchBarRef,
  children,
  className,
}: ViewFrameProps) {
  const navigation = useContext(NavigationContext);
  const isActive = navigation?.isActive ?? true;
  const depth = navigation?.depth ?? 0;
  const [contentActions, setContentActions] = useState<ActionPanelModel | null | undefined>(undefined);
  const [panel, setPanel] = useState<"actions" | "menu" | null>(null);
  const [activeDescendant, setActiveDescendant] = useState<string | undefined>(undefined);
  const searchRef = useRef<SearchBarHandle>(null);
  const keyHandlers = useRef(new Set<ViewKeyHandler>());
  const listId = useId();

  const effectiveActions = contentActions === undefined ? (actions ?? null) : contentActions;
  const actionsRef = useLatest(effectiveActions);

  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  useImperativeHandle(
    searchBarRef,
    () => ({
      focus: () => searchRef.current?.focus(),
      get input() {
        return searchRef.current?.input ?? null;
      },
      get arguments() {
        return searchRef.current?.arguments ?? null;
      },
    }),
    [],
  );

  const runAction = useCallback(
    (action: ActionModel) => {
      setPanel(null);
      if (action.submenu) {
        setPanel("actions");
        return;
      }
      if (action.disabled || !action.onAction) return;
      Promise.resolve()
        .then(() => action.onAction?.())
        .catch((error: unknown) => showFailureToast(`${action.title} failed`, error));
    },
    [],
  );

  const controller = useMemo<ViewController>(
    () => ({
      isActive,
      setActions: (model) => setContentActions(model),
      runAction,
      openActions: () => setPanel("actions"),
      closeActions: () => setPanel(null),
      isActionPanelOpen: panel === "actions",
      focusSearch,
      registerKeyHandler: (handler) => {
        keyHandlers.current.add(handler);
        return () => keyHandlers.current.delete(handler);
      },
      listId,
      setActiveDescendant,
    }),
    [isActive, runAction, panel, focusSearch, listId],
  );

  // Refocus the search field when this view becomes the top of the stack again.
  useEffect(() => {
    if (isActive && !panel) focusSearch();
  }, [isActive, panel, focusSearch]);

  const escapeRef = useLatest(onEscape ?? (() => navigation?.pop()));
  const menuRef = useLatest(menu);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const key = eventKey(event);
      if (matchesShortcut(event, CMD_K)) {
        event.preventDefault();
        setPanel((p) => (p === "actions" ? null : actionsRef.current ? "actions" : null));
        return;
      }
      if (menuRef.current && matchesShortcut(event, SHIFT_CMD_K)) {
        event.preventDefault();
        setPanel((p) => (p === "menu" ? null : "menu"));
        return;
      }
      if (panel) return; // the panel's menu handles everything else
      for (const handler of keyHandlers.current) {
        if (handler(event)) {
          event.preventDefault();
          return;
        }
      }
      const model = actionsRef.current;
      const { primary, secondary } = primaryActions(model);
      if (key === "return" && !event.altKey && !event.ctrlKey && !event.shiftKey) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "TEXTAREA" && !event.metaKey) return;
        if (target?.tagName === "BUTTON" && !event.metaKey) return;
        const cmd = event.metaKey;
        const action = primaryShortcut === "cmd-enter" ? (cmd ? primary : undefined) : cmd ? secondary : primary;
        if (action) {
          event.preventDefault();
          runAction(action);
        }
        return;
      }
      for (const action of actionsWithShortcuts(model)) {
        if (action.shortcut && !action.disabled && matchesShortcut(event, action.shortcut)) {
          event.preventDefault();
          runAction(action);
          return;
        }
      }
      if (searchBar && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !isEditable(event.target)) {
        focusSearch();
        return;
      }
      if (key === "escape" && !event.shiftKey && !event.altKey && !event.ctrlKey) {
        event.preventDefault();
        if (event.metaKey) navigation?.popToRoot();
        else escapeRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, panel, primaryShortcut, runAction, navigation, actionsRef, escapeRef, menuRef, searchBar, focusSearch]);

  const resolvedLeading = leading !== undefined ? leading : depth > 0 ? "back" : "logo";

  return (
    <ViewContext.Provider value={controller}>
      <section className={`sc-view${className ? ` ${className}` : ""}`} data-active={isActive || undefined} aria-hidden={!isActive || undefined}>
        <div className="sc-view__content">{children}</div>
        <SearchBar
          ref={searchRef}
          value={searchBar?.value}
          onChange={searchBar?.onChange}
          placeholder={searchBar?.placeholder}
          hideInput={!searchBar}
          autoFocus={isActive}
          leading={resolvedLeading}
          onBack={() => navigation?.pop()}
          accessory={headerAccessory}
          args={searchBar?.args}
          argValues={searchBar?.argValues}
          onArgChange={searchBar?.onArgChange}
          isLoading={isLoading}
          aria-controls={listId}
          aria-activedescendant={activeDescendant}
          onKeyDown={(event, field) => {
            if (onSearchKeyDown?.(event, field)) event.preventDefault();
          }}
        >
          {headerContent}
        </SearchBar>
        {!hideFooter && (
          <Footer
            menuButton={menu && depth === 0 && !navigationTitle ? { onClick: () => setPanel(panel === "menu" ? null : "menu"), open: panel === "menu" } : undefined}
            navigationTitle={navigationTitle}
            navigationIcon={navigationIcon}
            center={footerCenter}
            actions={effectiveActions}
            primaryActionTitle={primaryActionTitle}
            actionsOpen={panel === "actions"}
            onOpenActions={() => setPanel("actions")}
            onRunAction={runAction}
            primaryShortcut={primaryShortcut}
          />
        )}
        <ActionPanelPopover model={effectiveActions} open={isActive && panel === "actions"} onClose={() => setPanel(null)} onRun={runAction} primaryShortcut={primaryShortcut} />
        {menu && (
          <ActionPanelPopover model={menu} open={isActive && panel === "menu"} onClose={() => setPanel(null)} onRun={runAction} anchor={(root) => ({ x: 8, y: root.height - 8 })} align="start" />
        )}
      </section>
    </ViewContext.Provider>
  );
}
