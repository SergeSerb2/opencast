import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import type { ActionsProp } from "../actions/ActionPanel";
import type { ListItemModel, ListItemProps, ListSectionModel, ListSectionProps } from "./model";

/** Marker components: they render nothing; List reads their props. */
export function ListItem(_: ListItemProps): null {
  return null;
}
export function ListSection(_: ListSectionProps): null {
  return null;
}

export interface EmptyViewMarkerProps {
  title?: string;
  description?: string;
  icon?: ImageLike | null;
  actions?: ActionsProp;
}
export function ListEmptyView(_: EmptyViewMarkerProps): null {
  return null;
}

export function flattenElements(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...flattenElements((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}

/** Explicit `id` props are kept; React keys and positions are namespaced by section (keys may repeat across sections). */
function itemFrom(element: ReactElement, index: number, prefix: string): ListItemModel {
  const props = element.props as ListItemProps;
  const id = props.id ?? `${prefix}${element.key !== null ? String(element.key) : `#${index}`}`;
  return { ...props, id };
}

/**
 * Collect `<List.Section>` / `<List.Item>` / `<List.EmptyView>` children into
 * sections. Loose items before, between or after sections form untitled sections.
 */
export function collectListChildren(children: ReactNode): { sections: ListSectionModel[]; emptyView: EmptyViewMarkerProps | null } {
  const sections: ListSectionModel[] = [];
  let emptyView: EmptyViewMarkerProps | null = null;
  let loose: ListItemModel[] = [];
  const flush = () => {
    if (loose.length) sections.push({ id: `loose-${sections.length}`, items: loose });
    loose = [];
  };
  flattenElements(children).forEach((child, index) => {
    if (child.type === ListItem) loose.push(itemFrom(child, index, "~/"));
    else if (child.type === ListSection) {
      flush();
      const props = child.props as ListSectionProps;
      const sectionId = props.id ?? (child.key !== null ? String(child.key) : `section-${sections.length}`);
      const items = flattenElements(props.children)
        .filter((c) => c.type === ListItem)
        .map((c, i) => itemFrom(c, i, `${sectionId}/`));
      sections.push({ id: sectionId, title: props.title, subtitle: props.subtitle, accessory: props.accessory, items });
    } else if (child.type === ListEmptyView) emptyView = child.props as EmptyViewMarkerProps;
  });
  flush();
  return { sections, emptyView };
}
