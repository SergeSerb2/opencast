import type { ImageLike, KeyboardShortcut, UINode } from "@surgecast/protocol";
import type { ActionModel, ActionPanelModel, ActionSectionModel } from "../components/actions/model";
import { pickDate } from "../components/feedback/date-picker";
import { pasteTitle } from "../bridge/frontmost-app";
import { serializeFormValues } from "../components/Form/serialize";
import { callback, isHandler, isNode, str, type Dispatch } from "./props";

/** Default titles/icons of the built-in Raycast action kinds. */
const DEFAULTS: Record<string, { title?: string; icon?: ImageLike; style?: "destructive" }> = {
  "Action.CopyToClipboard": { title: "Copy to Clipboard", icon: "copy-clipboard-16" },
  "Action.Paste": { title: "Paste to Active App", icon: "clipboard-16" },
  "Action.OpenInBrowser": { title: "Open in Browser", icon: "globe-01-16" },
  "Action.Open": { icon: "finder-16" },
  "Action.OpenWith": { title: "Open With…", icon: "app-window-16" },
  "Action.ShowInFinder": { title: "Show in Finder", icon: "finder-16" },
  "Action.Trash": { title: "Move to Trash", icon: "trash-16", style: "destructive" },
  "Action.SubmitForm": { title: "Submit Form", icon: "checkmark-16" },
  "Action.CreateSnippet": { title: "Create Snippet", icon: "snippets-16" },
  "Action.CreateQuicklink": { title: "Create Quicklink", icon: "quicklink-16" },
  "Action.ToggleQuickLook": { title: "Quick Look", icon: "eye-16" },
  "Action.PickDate": { title: "Pick Date", icon: "calendar-16" },
};

export interface ActionMappingContext {
  dispatch: Dispatch;
  /** Current values of the enclosing form, for SubmitForm and actions inside forms. */
  getFormValues?: () => Record<string, unknown>;
}

function isShortcut(value: unknown): value is KeyboardShortcut {
  return typeof value === "object" && value !== null && Array.isArray((value as KeyboardShortcut).modifiers) && typeof (value as KeyboardShortcut).key === "string";
}

/** Map one `Action*` or `ActionPanel.Submenu` node to an action row. */
export function mapAction(node: UINode, context: ActionMappingContext): ActionModel | null {
  const p = node.props;
  if (node.type === "ActionPanel.Submenu") {
    return {
      id: node.id,
      title: str(p.title) ?? "Submenu",
      icon: p.icon as ImageLike | undefined,
      shortcut: isShortcut(p.shortcut) ? p.shortcut : undefined,
      submenu: {
        sections: mapSections(node.children, context),
        filtering: typeof p.filtering === "boolean" ? p.filtering : typeof p.filtering === "object" ? true : undefined,
        isLoading: p.isLoading === true,
        searchPlaceholder: str(p.placeholder),
        onOpen: callback(p.onOpen, context.dispatch),
        onSearchTextChange: callback<[string]>(p.onSearchTextChange, context.dispatch),
      },
    };
  }
  if (node.type !== "Action" && !node.type.startsWith("Action.")) return null;
  const defaults = node.type === "Action.Paste" ? { ...DEFAULTS[node.type], title: pasteTitle() } : (DEFAULTS[node.type] ?? {});
  const handler = p.onAction;
  return {
    id: node.id,
    title: str(p.title) ?? defaults.title ?? "Action",
    icon: (p.icon as ImageLike | undefined) ?? defaults.icon,
    shortcut: isShortcut(p.shortcut) ? p.shortcut : undefined,
    style: p.style === "destructive" ? "destructive" : defaults.style,
    onAction: isHandler(handler)
      ? async () => {
          if (node.type === "Action.PickDate") {
            const date = await pickDate(p.type === "date" ? "date" : "datetime");
            if (date) context.dispatch(handler, [{ date: date.toISOString() }]);
            return;
          }
          const values = context.getFormValues?.();
          context.dispatch(handler, [values ? { formValues: serializeFormValues(values) } : {}]);
        }
      : undefined,
  };
}

function mapSections(children: UINode[], context: ActionMappingContext): ActionSectionModel[] {
  const sections: ActionSectionModel[] = [];
  let loose: ActionModel[] = [];
  const flush = () => {
    if (loose.length) sections.push({ actions: loose });
    loose = [];
  };
  for (const child of children) {
    if (child.type === "ActionPanel.Section") {
      flush();
      const actions = child.children.map((c) => mapAction(c, context)).filter((a): a is ActionModel => a !== null);
      if (actions.length) sections.push({ id: child.id, title: str(child.props.title), actions });
    } else {
      const action = mapAction(child, context);
      if (action) loose.push(action);
    }
  }
  flush();
  return sections;
}

/** `ActionPanel` node (the `actions` prop) → panel model. */
export function mapActionPanel(node: unknown, context: ActionMappingContext): ActionPanelModel | null {
  if (!isNode(node) || node.type !== "ActionPanel") return null;
  return { title: str(node.props.title), sections: mapSections(node.children, context) };
}
