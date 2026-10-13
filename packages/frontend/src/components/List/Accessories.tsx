import { memo, type ReactNode } from "react";
import type { ColorLike, ImageLike } from "@opencast/protocol";
import { resolveColor } from "../../icons/colors";
import { Image } from "../../icons/Image";
import { useTheme } from "../../theme/ThemeProvider";
import { AliasBadge, Tag } from "../Badge/Badge";
import { Shortcut } from "../Keycap/Keycap";
import { Tooltip } from "../Tooltip/Tooltip";
import type { ListAccessory } from "./model";

/** Short relative time for date accessories: now, 5m, 3h, 2d, then "Mar 4". */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const sign = seconds < 0 ? "in " : "";
  if (abs < 60) return "now";
  if (abs < 3600) return `${sign}${Math.floor(abs / 60)}m`;
  if (abs < 86400) return `${sign}${Math.floor(abs / 3600)}h`;
  if (abs < 7 * 86400) return `${sign}${Math.floor(abs / 86400)}d`;
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}

function AccessoryView({ accessory, appearance }: { accessory: ListAccessory; appearance: "dark" | "light" }): ReactNode {
  const parts: ReactNode[] = [];
  let tooltip = accessory.tooltip ?? undefined;

  if (accessory.alias) parts.push(<AliasBadge key="alias" alias={accessory.alias} />);
  if (accessory.shortcut) parts.push(<Shortcut key="shortcut" shortcut={accessory.shortcut} />);

  if (accessory.icon) {
    const value = isObject(accessory.icon) && "value" in accessory.icon ? (accessory.icon.value as ImageLike | null) : (accessory.icon as ImageLike);
    if (isObject(accessory.icon) && "tooltip" in accessory.icon) tooltip = (accessory.icon.tooltip as string | null) ?? tooltip;
    if (value) parts.push(<Image key="icon" source={value} size={16} />);
  }

  if (accessory.tag !== undefined) {
    const raw = isObject(accessory.tag) ? accessory.tag.value : accessory.tag;
    const color = isObject(accessory.tag) ? (accessory.tag.color as ColorLike | undefined) : undefined;
    const date = raw instanceof Date ? raw : null;
    if (raw !== null && raw !== undefined && raw !== "") {
      if (date && !tooltip) tooltip = date.toLocaleString();
      parts.push(
        <Tag key="tag" color={color}>
          {date ? formatRelativeDate(date) : String(raw)}
        </Tag>,
      );
    }
  }

  if (accessory.date !== undefined) {
    const raw = isObject(accessory.date) ? accessory.date.value : accessory.date;
    const color = isObject(accessory.date) ? (accessory.date.color as ColorLike | undefined) : undefined;
    const date = asDate(raw);
    if (date) {
      if (!tooltip) tooltip = date.toLocaleString();
      parts.push(
        <span key="date" className="sc-list-accessory__text" style={{ color: resolveColor(color, appearance) }}>
          {formatRelativeDate(date)}
        </span>,
      );
    }
  }

  if (accessory.text !== undefined) {
    const value = isObject(accessory.text) ? accessory.text.value : accessory.text;
    const color = isObject(accessory.text) ? (accessory.text.color as ColorLike | undefined) : undefined;
    if (value) {
      parts.push(
        <span key="text" className="sc-list-accessory__text sc-truncate" style={{ color: resolveColor(color, appearance) }}>
          {value}
        </span>,
      );
    }
  }

  if (parts.length === 0) return null;
  const node = <span className="sc-list-accessory">{parts}</span>;
  return tooltip ? <Tooltip content={tooltip}>{node}</Tooltip> : node;
}

/** Right-aligned accessories of a list row (gap 12, last 3ch fade when overflowing). */
export const Accessories = memo(function Accessories({ accessories, selected }: { accessories: ListAccessory[] | undefined; selected: boolean }) {
  const { appearance } = useTheme();
  if (!accessories || accessories.length === 0) return null;
  const visible = accessories.filter((a) => !a.onlyWhenSelected || selected);
  if (visible.length === 0) return null;
  return (
    <span className="sc-list-item__accessories">
      {visible.map((accessory, i) => (
        <AccessoryView key={i} accessory={accessory} appearance={appearance} />
      ))}
    </span>
  );
});
