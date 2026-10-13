import { useMemo, useRef, useState } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Menu, Popover, type MenuItem } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { RAYCAST_ICONS } from "../../../icons/raycast-icons.generated";
import "./icon-picker.css";

/** "blank-document-16" → "Blank Document". */
export function iconTitle(name: string): string {
  return name
    .replace(/-16$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const ICON_ITEMS: MenuItem[] = Object.keys(RAYCAST_ICONS).map((name) => ({ id: name, title: iconTitle(name), icon: name }));

export interface IconPickerProps {
  /** Selected icon name, or a lead option's id. */
  value: string;
  onChange: (value: string) => void;
  /** Options listed before the icon catalog (e.g. "Default" with the live favicon). */
  leadOptions?: { id: string; title: string; icon: ImageLike }[];
  "aria-label"?: string;
}

/** Icon-only trigger (glyph + chevron) opening a searchable icon menu, for a text field's accessory slot. */
export function IconPicker({ value, onChange, leadOptions = [], ...aria }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lead = leadOptions.find((o) => o.id === value);
  const sections = useMemo(
    () => [
      ...(leadOptions.length ? [{ id: "lead", items: leadOptions.map((o) => ({ id: o.id, title: o.title, icon: o.icon, checked: o.id === value })) }] : []),
      { id: "icons", title: leadOptions.length ? "Icons" : undefined, items: ICON_ITEMS.map((item) => (item.id === value ? { ...item, checked: true } : item)) },
    ],
    [leadOptions, value],
  );
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sc-icon-picker"
        data-state={open ? "open" : "closed"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={aria["aria-label"] ?? "Icon"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Image source={lead?.icon ?? value} size={16} />
        <Icon name="chevron-down-small-16" size={16} className="sc-icon-picker__chevron" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={triggerRef.current} side="bottom" align="end" width={220} aria-label="Choose Icon">
        {({ side }) => (
          <Menu
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Search icons…"
            sections={sections}
            preserveSectionsOnSearch
            initialSelectedId={value}
            onSelect={(item) => {
              onChange(item.id);
              setOpen(false);
              triggerRef.current?.focus();
            }}
            onDismiss={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
          />
        )}
      </Popover>
    </>
  );
}
