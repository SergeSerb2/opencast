import { useLayoutEffect, useMemo, useState } from "react";
import { Menu, type MenuSection } from "../Menu/Menu";
import { Popover, type PopoverAnchor } from "../Popover/Popover";
import type { ActionModel, ActionPanelModel, ActionSectionModel, ActionSubmenuModel } from "../actions/model";
import "./action-panel.css";

export interface ActionPanelPopoverProps {
  model: ActionPanelModel | null;
  open: boolean;
  onClose: () => void;
  onRun: (action: ActionModel) => void;
  /** Submenu to show when the panel opens (action ids from the root), e.g. after a submenu shortcut. */
  initialPath?: string[];
  /** Defaults to the window's bottom-right corner, inset 8px (§4). */
  anchor?: PopoverAnchor;
  align?: "start" | "end";
}

interface Level {
  title?: string;
  sections: ActionSectionModel[];
  submenu?: ActionSubmenuModel;
}

const BOTTOM_RIGHT: PopoverAnchor = (root) => ({ x: root.width - 8, y: root.height - 8 });

function findById(sections: ActionSectionModel[], id: string): ActionModel | undefined {
  for (const section of sections) for (const action of section.actions) if (action.id === id) return action;
  return undefined;
}

/** Resolve the submenu path against the current model, so content updates keep the open submenu. */
export function resolveLevels(model: ActionPanelModel | null, path: string[]): Level[] {
  if (!model) return [];
  const levels: Level[] = [{ title: model.title, sections: model.sections }];
  for (const id of path) {
    const action = findById(levels[levels.length - 1].sections, id);
    if (!action?.submenu) break;
    levels.push({ title: action.title, sections: action.submenu.sections, submenu: action.submenu });
  }
  return levels;
}

function toMenuSections(sections: ActionSectionModel[]): { menu: MenuSection[]; byId: Map<string, ActionModel> } {
  const byId = new Map<string, ActionModel>();
  const menu = sections.map((section, si) => ({
    id: section.id ?? `section-${si}`,
    title: section.title,
    items: section.actions.map((action, ai) => {
      const id = `${si}:${ai}:${action.id}`;
      byId.set(id, action);
      return { id, title: action.title, icon: action.icon, shortcut: action.shortcut, style: action.style, disabled: action.disabled, keywords: action.keywords, hasSubmenu: Boolean(action.submenu) };
    }),
  }));
  return { menu, byId };
}

/** The ⌘K panel: 350×≤280 glass card opening upward from the footer's right pill, search at the bottom. */
export function ActionPanelPopover({ model, open, onClose, onRun, initialPath, anchor = BOTTOM_RIGHT, align = "end" }: ActionPanelPopoverProps) {
  const [path, setPath] = useState<string[]>([]);

  // Reset only when the panel opens; model updates while open keep the submenu path.
  useLayoutEffect(() => {
    if (open) setPath(initialPath ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const levels = useMemo(() => resolveLevels(model, path), [model, path]);
  const level = levels[levels.length - 1];
  const { menu, byId } = useMemo(() => toMenuSections(level?.sections ?? []), [level]);

  const select = (id: string) => {
    const action = byId.get(id);
    if (!action) return;
    if (action.submenu) {
      action.submenu.onOpen?.();
      setPath((p) => [...p.slice(0, levels.length - 1), action.id]);
      return;
    }
    onRun(action);
  };

  return (
    <Popover open={open && Boolean(level)} onClose={onClose} anchor={anchor} side="top" align={align} offset={0} width={350} flip={false} className="sc-action-panel" aria-label="Actions" role="dialog">
      {level && (
        <Menu
          key={levels.length}
          sections={menu}
          title={level.title}
          layout="up"
          searchPlaceholder={level.submenu?.searchPlaceholder ?? "Search for actions…"}
          filtering={level.submenu?.filtering ?? true}
          isLoading={level.submenu?.isLoading}
          onSearchTextChange={level.submenu?.onSearchTextChange}
          onSelect={(item) => select(item.id)}
          onDismiss={() => (levels.length > 1 ? setPath((p) => p.slice(0, levels.length - 2)) : onClose())}
          aria-label={level.title ?? "Actions"}
        />
      )}
    </Popover>
  );
}
