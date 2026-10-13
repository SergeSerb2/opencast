import type { ReactNode } from "react";
import type { ColorLike, ImageLike, KeyboardShortcut } from "@opencast/protocol";
import type { MatchRange } from "../../lib/fuzzy";
import type { ActionsProp } from "../actions/ActionPanel";

/** Raycast `List.Item.Accessory`, plus OpenCast's root-search accessories. */
export interface ListAccessory {
  text?: string | { value?: string | null; color?: ColorLike };
  icon?: ImageLike | { value: ImageLike | null | undefined; tooltip?: string | null } | null;
  tag?: string | Date | { value: string | Date | null | undefined; color?: ColorLike };
  date?: Date | { value: Date | null | undefined; color?: ColorLike };
  tooltip?: string | null;
  /** Keycaps (hotkey accessory). */
  shortcut?: KeyboardShortcut;
  /** Alias badge. */
  alias?: string;
  /** Only render on the selected row (application hotkeys). */
  onlyWhenSelected?: boolean;
}

export type TextWithTooltip = string | { value: string; tooltip?: string | null };

export interface ListItemProps {
  id?: string;
  title: TextWithTooltip;
  subtitle?: TextWithTooltip;
  icon?: ImageLike | null;
  accessories?: ListAccessory[];
  keywords?: string[];
  actions?: ActionsProp;
  /** `<List.Item.Detail>` shown in the detail pane when the list `isShowingDetail`. */
  detail?: ReactNode;
  /** OpenCast: highlighted ranges of the title (fuzzy matches). */
  titleRanges?: MatchRange[];
  /** OpenCast: small dot under the icon (running application). */
  iconDot?: "default" | "accent";
  /** OpenCast: custom row height and content (e.g. the calculator card). */
  height?: number;
  render?: (state: { selected: boolean }) => ReactNode;
  disabled?: boolean;
}

export interface ListSectionProps {
  id?: string;
  title?: string;
  subtitle?: string;
  /** Trailing control in the header (e.g. a "Manage" cog). */
  accessory?: ReactNode;
  children?: ReactNode;
}

export interface ListItemModel extends ListItemProps {
  id: string;
}

export interface ListSectionModel {
  id: string;
  title?: string;
  subtitle?: string;
  accessory?: ReactNode;
  items: ListItemModel[];
}

export function textValue(text: TextWithTooltip | undefined): string {
  if (!text) return "";
  return typeof text === "string" ? text : text.value;
}

export function textTooltip(text: TextWithTooltip | undefined): string | undefined {
  return text && typeof text === "object" ? (text.tooltip ?? undefined) : undefined;
}
