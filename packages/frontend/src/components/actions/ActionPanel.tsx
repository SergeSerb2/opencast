import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { ImageLike, KeyboardShortcut } from "@opencast/protocol";
import type { ActionModel, ActionPanelModel, ActionSectionModel, ActionStyle } from "./model";

/**
 * Declarative action panel, mirroring `@raycast/api`:
 *
 *   actions={
 *     <ActionPanel title="Clipboard History">
 *       <Action title="Paste" onAction={paste} />
 *       <ActionPanel.Section title="Item">
 *         <Action.CopyToClipboard content={text} shortcut={sc("cmd", "c")} />
 *       </ActionPanel.Section>
 *     </ActionPanel>
 *   }
 *
 * The elements render nothing; `collectActions` turns them into an
 * `ActionPanelModel`. Actions must be direct children (arrays and fragments are fine).
 */

export interface ActionProps {
  id?: string;
  title: string;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  style?: ActionStyle;
  keywords?: string[];
  disabled?: boolean;
  onAction?: () => unknown;
}

export interface ActionPanelProps {
  title?: string;
  children?: ReactNode;
}

export interface ActionPanelSectionProps {
  id?: string;
  title?: string;
  children?: ReactNode;
}

export interface ActionPanelSubmenuProps {
  id?: string;
  title: string;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  filtering?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  onOpen?: () => void;
  onSearchTextChange?: (text: string) => void;
  children?: ReactNode;
}

/** Built-in action components register a factory that turns props into a model. */
export type ActionFactory<P> = (props: P, context: ActionContext) => ActionModel;

/** Services the built-in action kinds need when they run. */
export interface ActionContext {
  push: (view: ReactNode) => void;
  getFormValues: () => Record<string, unknown> | undefined;
}

const FACTORY = Symbol.for("opencast.actionFactory");

type ActionComponent<P> = ((props: P) => null) & { [FACTORY]?: ActionFactory<P> };

export function defineAction<P>(displayName: string, factory: ActionFactory<P>): ActionComponent<P> {
  const component = (() => null) as ActionComponent<P>;
  Object.defineProperty(component, "name", { value: displayName });
  component[FACTORY] = factory;
  return component;
}

export const BaseAction = defineAction<ActionProps>("Action", (props) => ({
  id: props.id ?? props.title,
  title: props.title,
  icon: props.icon,
  shortcut: props.shortcut,
  style: props.style,
  keywords: props.keywords,
  disabled: props.disabled,
  onAction: props.onAction,
}));

function Section(_: ActionPanelSectionProps): null {
  return null;
}
function Submenu(_: ActionPanelSubmenuProps): null {
  return null;
}

export function ActionPanel(_: ActionPanelProps): null {
  return null;
}
ActionPanel.Section = Section;
ActionPanel.Submenu = Submenu;

function flatChildren(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...flatChildren((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}

function collectSections(children: ReactNode, context: ActionContext): ActionSectionModel[] {
  const sections: ActionSectionModel[] = [];
  let loose: ActionModel[] = [];
  const flushLoose = () => {
    if (loose.length) sections.push({ actions: loose });
    loose = [];
  };
  for (const child of flatChildren(children)) {
    if (child.type === Section) {
      flushLoose();
      const props = child.props as ActionPanelSectionProps;
      const actions = collectSections(props.children, context).flatMap((s) => s.actions);
      if (actions.length) sections.push({ id: props.id, title: props.title, actions });
      continue;
    }
    const action = collectAction(child, context);
    if (action) loose.push(action);
  }
  flushLoose();
  return sections;
}

function collectAction(element: ReactElement, context: ActionContext): ActionModel | null {
  if (element.type === Submenu) {
    const props = element.props as ActionPanelSubmenuProps;
    return {
      id: props.id ?? props.title,
      title: props.title,
      icon: props.icon,
      shortcut: props.shortcut,
      submenu: {
        sections: collectSections(props.children, context),
        filtering: props.filtering,
        isLoading: props.isLoading,
        searchPlaceholder: props.placeholder,
        onOpen: props.onOpen,
        onSearchTextChange: props.onSearchTextChange,
      },
    };
  }
  const factory = (element.type as ActionComponent<unknown>)[FACTORY];
  return factory ? factory(element.props, context) : null;
}

export type ActionsProp = ReactElement | ActionPanelModel | null | undefined;

function isModel(value: ActionsProp): value is ActionPanelModel {
  return typeof value === "object" && value !== null && !isValidElement(value) && Array.isArray((value as ActionPanelModel).sections);
}

/** Normalize the `actions` prop (an `<ActionPanel>` element or a model) to a model. */
export function collectActions(actions: ActionsProp, context: ActionContext): ActionPanelModel | null {
  if (!actions) return null;
  if (isModel(actions)) return actions;
  if (actions.type !== ActionPanel) return null;
  const props = actions.props as ActionPanelProps;
  return { title: props.title, sections: collectSections(props.children, context) };
}
