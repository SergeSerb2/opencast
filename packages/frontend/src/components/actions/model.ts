import type { ImageLike, KeyboardShortcut } from "@surgecast/protocol";

export type ActionStyle = "default" | "destructive";

/** One row in the action panel (⌘K). */
export interface ActionModel {
  /** Stable id (defaults to the title). */
  id: string;
  title: string;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  style?: ActionStyle;
  /** Extra search terms for the panel's filter. */
  keywords?: string[];
  /** Shown dimmed and not selectable. */
  disabled?: boolean;
  /** Close the panel and run. Errors become failure toasts. */
  onAction?: () => unknown;
  /** A submenu replaces the panel's list in place. */
  submenu?: ActionSubmenuModel;
}

export interface ActionSubmenuModel {
  sections: ActionSectionModel[];
  searchPlaceholder?: string;
  /** Filter rows locally on search text (default true). */
  filtering?: boolean;
  isLoading?: boolean;
  onOpen?: () => void;
  onSearchTextChange?: (text: string) => void;
}

export interface ActionSectionModel {
  id?: string;
  title?: string;
  actions: ActionModel[];
}

export interface ActionPanelModel {
  /** Header shown at the top of the panel (usually the selected item's title). */
  title?: string;
  sections: ActionSectionModel[];
}

export function flattenActions(model: ActionPanelModel | null | undefined): ActionModel[] {
  if (!model) return [];
  return model.sections.flatMap((s) => s.actions);
}

/** First and second runnable actions: bound to ↵ and ⌘↵. */
export function primaryActions(model: ActionPanelModel | null | undefined): { primary?: ActionModel; secondary?: ActionModel } {
  const all = flattenActions(model).filter((a) => !a.disabled);
  return { primary: all[0], secondary: all[1] };
}

/** All actions with shortcuts, including those inside submenus. */
export function actionsWithShortcuts(model: ActionPanelModel | null | undefined): ActionModel[] {
  const out: ActionModel[] = [];
  const visit = (sections: ActionSectionModel[]) => {
    for (const section of sections) {
      for (const action of section.actions) {
        if (action.shortcut) out.push(action);
        if (action.submenu) visit(action.submenu.sections);
      }
    }
  };
  if (model) visit(model.sections);
  return out;
}

export function isEmptyPanel(model: ActionPanelModel | null | undefined): boolean {
  return flattenActions(model).length === 0;
}
