import { useContext, useEffect, useMemo, useRef } from "react";
import { collectActions, type ActionContext, type ActionsProp } from "../actions/ActionPanel";
import type { ActionModel, ActionPanelModel, ActionSectionModel } from "../actions/model";
import { FormValuesContext } from "../Form/form-context";
import { useNavigation, useOptionalViewController } from "./contexts";

/** Services for built-in action kinds (Action.Push, Action.SubmitForm). */
export function useActionContext(): ActionContext {
  const navigation = useNavigation();
  const form = useContext(FormValuesContext);
  return useMemo(() => ({ push: (view) => navigation.push(view), getFormValues: () => form?.getValues() }), [navigation, form]);
}

/** Structural fingerprint: changes when rows change, not when closures do. */
export function actionsSignature(model: ActionPanelModel | null): string {
  if (!model) return "null";
  const sections = (list: ActionSectionModel[]): unknown =>
    list.map((s) => [s.id, s.title, s.actions.map((a) => [a.id, a.title, a.icon, a.shortcut, a.style, a.disabled, a.keywords, a.submenu ? sections(a.submenu.sections) : null, a.submenu?.isLoading])]);
  return JSON.stringify([model.title, sections(model.sections)]);
}

function findAction(model: ActionPanelModel | null, path: number[]): ActionModel | undefined {
  let sections = model?.sections;
  let action: ActionModel | undefined;
  for (let i = 0; i < path.length; i += 2) {
    action = sections?.[path[i]]?.actions[path[i + 1]];
    sections = action?.submenu?.sections;
  }
  return action;
}

/** Same rows, but every callback resolves through `latest` so it never goes stale. */
function proxify(model: ActionPanelModel, latest: { current: ActionPanelModel | null }): ActionPanelModel {
  const mapSections = (list: ActionSectionModel[], prefix: number[]): ActionSectionModel[] =>
    list.map((section, si) => ({
      ...section,
      actions: section.actions.map((action, ai) => {
        const path = [...prefix, si, ai];
        return {
          ...action,
          onAction: action.onAction ? () => findAction(latest.current, path)?.onAction?.() : undefined,
          submenu: action.submenu
            ? {
                ...action.submenu,
                sections: mapSections(action.submenu.sections, path),
                onOpen: () => findAction(latest.current, path)?.submenu?.onOpen?.(),
                onSearchTextChange: (text: string) => findAction(latest.current, path)?.submenu?.onSearchTextChange?.(text),
              }
            : undefined,
        };
      }),
    }));
  return { title: model.title, sections: mapSections(model.sections, []) };
}

/**
 * Register the actions for the current content with the enclosing ViewFrame
 * (footer + ⌘K). Accepts an `<ActionPanel>` element or a model; re-registers
 * only when the rows change.
 */
export function useRegisterActions(actions: ActionsProp, enabled = true): ActionPanelModel | null {
  const view = useOptionalViewController();
  const context = useActionContext();
  const model = collectActions(actions, context);
  const latest = useRef<ActionPanelModel | null>(model);
  latest.current = model;
  const signature = actionsSignature(model);
  const stable = useMemo(() => (model ? proxify(model, latest) : null), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const setActions = view?.setActions;

  useEffect(() => {
    if (!enabled || !setActions) return;
    setActions(stable);
  }, [stable, enabled, setActions]);

  return stable;
}
