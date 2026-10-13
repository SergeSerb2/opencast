import type { ColorLike, ImageLike, UINode } from "@surgecast/protocol";
import type { MetadataEntry } from "../components/Detail/Metadata";
import type { ActionPanelModel } from "../components/actions/model";
import type { GridAspectRatio, GridContent, GridFit, GridInset, GridItemProps } from "../components/Grid/Grid";
import type { ListAccessory, ListItemProps, TextWithTooltip } from "../components/List/model";
import { mapActionPanel, type ActionMappingContext } from "./actions";
import { bool, callback, childrenOfType, isNode, itemId, revive, str, type Dispatch } from "./props";

/** Everything the UINode → props mapping needs. */
export interface MappingContext extends ActionMappingContext {
  dispatch: Dispatch;
}

function textWithTooltip(value: unknown): TextWithTooltip | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const v = value as { value?: unknown; tooltip?: unknown };
    return typeof v.value === "string" ? { value: v.value, tooltip: str(v.tooltip) ?? null } : undefined;
  }
  return undefined;
}

/** Raycast accessories with `{ $date }` revived to Dates. */
export function mapAccessories(value: unknown): ListAccessory[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return revive(value).filter((a): a is ListAccessory => typeof a === "object" && a !== null);
}

/** `List.Item.Detail.Metadata` / `Detail.Metadata` children → entries. */
export function mapMetadata(node: unknown, dispatch: Dispatch): MetadataEntry[] | undefined {
  if (!isNode(node)) return undefined;
  const entries: MetadataEntry[] = [];
  for (const child of node.children) {
    const p = child.props;
    if (child.type.endsWith(".Label")) {
      const text = p.text;
      const value = typeof text === "object" && text !== null ? str((text as { value?: unknown }).value) : str(text);
      const color = typeof text === "object" && text !== null ? ((text as { color?: ColorLike }).color ?? undefined) : undefined;
      entries.push({ kind: "label", title: str(p.title) ?? "", text: value, color, icon: p.icon as ImageLike | undefined });
    } else if (child.type.endsWith(".Link")) {
      entries.push({ kind: "link", title: str(p.title) ?? "", text: str(p.text) ?? "", target: str(p.target) ?? "" });
    } else if (child.type.endsWith(".TagList")) {
      entries.push({
        kind: "tags",
        title: str(p.title) ?? "",
        tags: child.children.map((tag) => ({ text: str(tag.props.text), color: tag.props.color as ColorLike | undefined, icon: tag.props.icon as ImageLike | undefined, onAction: callback(tag.props.onAction, dispatch) })),
      });
    } else if (child.type.endsWith(".Separator")) {
      entries.push({ kind: "separator" });
    }
  }
  return entries;
}

export interface MappedListItem extends Omit<ListItemProps, "actions"> {
  id: string;
  actions: ActionPanelModel | null;
  detailProps?: { markdown?: string; metadata?: MetadataEntry[]; isLoading?: boolean };
}

/** `List.Item` node → List.Item props. */
export function mapListItem(node: UINode, context: MappingContext): MappedListItem {
  const p = node.props;
  const detail = isNode(p.detail) ? p.detail : undefined;
  return {
    id: itemId(node),
    title: textWithTooltip(p.title) ?? "",
    subtitle: textWithTooltip(p.subtitle),
    icon: (p.icon as ImageLike | undefined) ?? undefined,
    keywords: Array.isArray(p.keywords) ? p.keywords.filter((k): k is string => typeof k === "string") : undefined,
    accessories: mapAccessories(p.accessories),
    actions: mapActionPanel(p.actions, context),
    detailProps: detail
      ? { markdown: str(detail.props.markdown), metadata: mapMetadata(detail.props.metadata, context.dispatch), isLoading: bool(detail.props.isLoading) }
      : undefined,
  };
}

const ITEM_SIZE_COLUMNS: Record<string, number> = { small: 8, medium: 5, large: 3 };
const RATIOS = new Set(["1", "3/2", "2/3", "4/3", "3/4", "16/9", "9/16"]);

export interface MappedGridLayout {
  columns?: number;
  aspectRatio?: GridAspectRatio;
  fit?: GridFit;
  inset?: GridInset;
}

/** Grid / Grid.Section layout props (itemSize → columns for older extensions). */
export function mapGridLayout(props: Record<string, unknown>): MappedGridLayout {
  const columns = typeof props.columns === "number" ? props.columns : typeof props.itemSize === "string" ? ITEM_SIZE_COLUMNS[props.itemSize] : undefined;
  const ratio = str(props.aspectRatio);
  return {
    columns: columns && columns > 0 ? Math.min(8, Math.max(1, Math.round(columns))) : undefined,
    aspectRatio: ratio && RATIOS.has(ratio) ? (ratio as GridAspectRatio) : undefined,
    fit: props.fit === "fill" ? "fill" : props.fit === "contain" ? "contain" : undefined,
    inset: ["zero", "small", "medium", "large"].includes(String(props.inset)) ? (props.inset as GridInset) : undefined,
  };
}

/** `Grid.Item` node → Grid.Item props. */
export function mapGridItem(node: UINode, context: MappingContext): GridItemProps & { id: string } {
  const p = node.props;
  const accessory = p.accessory as { icon?: ImageLike; tooltip?: string | null } | undefined;
  return {
    id: itemId(node),
    content: (p.content as GridContent | undefined) ?? "",
    title: str(p.title),
    subtitle: str(p.subtitle),
    accessory: accessory?.icon ? { icon: accessory.icon, tooltip: accessory.tooltip ?? null } : undefined,
    keywords: Array.isArray(p.keywords) ? p.keywords.filter((k): k is string => typeof k === "string") : undefined,
    actions: mapActionPanel(p.actions, context),
  };
}

/** Dropdown children (`*.Dropdown.Item` / `*.Dropdown.Section`) → sections. */
export function mapDropdownSections(node: UINode): { title?: string; items: { value: string; title: string; icon?: ImageLike; keywords?: string[] }[] }[] {
  const sections: { title?: string; items: { value: string; title: string; icon?: ImageLike; keywords?: string[] }[] }[] = [];
  const toItem = (c: UINode) => ({ value: str(c.props.value) ?? "", title: str(c.props.title) ?? str(c.props.value) ?? "", icon: c.props.icon as ImageLike | undefined, keywords: Array.isArray(c.props.keywords) ? (c.props.keywords as string[]) : undefined });
  let loose: ReturnType<typeof toItem>[] = [];
  for (const child of node.children) {
    if (child.type.endsWith(".Section")) {
      if (loose.length) sections.push({ items: loose });
      loose = [];
      sections.push({ title: str(child.props.title), items: child.children.filter((c) => c.type.endsWith(".Item")).map(toItem) });
    } else if (child.type.endsWith(".Item")) loose.push(toItem(child));
  }
  if (loose.length) sections.push({ items: loose });
  return sections;
}

/** Sections of a List/Grid root: `*.Section` nodes and loose items. */
export function groupSections(root: UINode, sectionType: string, itemType: string): { node: UINode | null; items: UINode[] }[] {
  const groups: { node: UINode | null; items: UINode[] }[] = [];
  let loose: UINode[] = [];
  for (const child of root.children) {
    if (child.type === sectionType) {
      if (loose.length) groups.push({ node: null, items: loose });
      loose = [];
      groups.push({ node: child, items: childrenOfType(child, itemType) });
    } else if (child.type === itemType) loose.push(child);
  }
  if (loose.length) groups.push({ node: null, items: loose });
  return groups;
}
