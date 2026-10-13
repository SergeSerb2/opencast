import { useMemo, useRef, useState } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Icon } from "../../icons/Icon";
import { Image } from "../../icons/Image";
import { Menu, type MenuSection } from "../Menu/Menu";
import { Popover } from "../Popover/Popover";
import "./dropdown.css";

export interface DropdownItem {
  value: string;
  title: string;
  icon?: ImageLike;
  keywords?: string[];
}

export interface DropdownSection {
  title?: string;
  items: DropdownItem[];
}

export interface DropdownProps {
  value: string | undefined;
  onChange: (value: string) => void;
  /** Flat items or sections. */
  items?: DropdownItem[];
  sections?: DropdownSection[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** "field" (forms, bordered), "small", "nav" (search-bar accessory), or "ghost" (unboxed 24px popup used by Settings rows). */
  variant?: "field" | "small" | "nav" | "ghost";
  /** Leading glyph shown in the trigger (nav variant). */
  icon?: ImageLike;
  filtering?: boolean;
  /** Show the menu's search field (default true; short lists can hide it). */
  showSearch?: boolean;
  onSearchTextChange?: (text: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  validation?: "error" | "success";
  id?: string;
  "aria-label"?: string;
  /** Called when the menu opens/closes (e.g. to pause list keyboard handling). */
  onOpenChange?: (open: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** Popup button with a searchable menu (§5.3 Dropdown, §5.6 search-bar accessory). */
export function Dropdown({
  value,
  onChange,
  items,
  sections,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  variant = "field",
  icon,
  filtering = true,
  showSearch = true,
  onSearchTextChange,
  isLoading,
  disabled,
  validation,
  id,
  onOpenChange,
  onFocus,
  onBlur,
  ...aria
}: DropdownProps) {
  const [open, setOpenState] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const allSections = useMemo<DropdownSection[]>(() => sections ?? [{ items: items ?? [] }], [sections, items]);
  const selected = useMemo(() => allSections.flatMap((s) => s.items).find((i) => i.value === value), [allSections, value]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
    if (!next) triggerRef.current?.focus({ preventScroll: true });
  };

  const menuSections = useMemo<MenuSection[]>(
    () =>
      allSections.map((s, si) => ({
        id: `s${si}`,
        title: s.title,
        items: s.items.map((i) => ({ id: i.value, title: i.title, icon: i.icon, keywords: i.keywords, checked: i.value === value })),
      })),
    [allSections, value],
  );

  const leading = icon ?? selected?.icon;
  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`sc-dropdown${variant === "nav" || variant === "ghost" ? "" : " sc-field"}`}
        data-variant={variant}
        data-state={open ? "open" : "closed"}
        data-validation={validation}
        data-placeholder={!selected || undefined}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={aria["aria-label"]}
        onMouseDown={(e) => e.preventDefault()}
        onFocus={onFocus}
        onBlur={() => !open && onBlur?.()}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {leading !== undefined && <Image source={leading} size={16} className="sc-dropdown__icon" />}
        <span className="sc-dropdown__value sc-truncate">{selected?.title ?? placeholder}</span>
        <Icon name="chevron-down-small-16" size={variant === "nav" ? 18 : 16} className="sc-dropdown__chevron" />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchor={triggerRef.current}
        side="bottom"
        align={variant === "nav" || variant === "ghost" ? "end" : "start"}
        alignOffset={variant === "ghost" ? -8 : -4}
        width={variant === "nav" ? Math.max(188, (triggerRef.current?.offsetWidth ?? 0) + 8) : variant === "ghost" ? Math.max(180, (triggerRef.current?.offsetWidth ?? 0) + 16) : "anchor"}
        role="dialog"
        aria-label={aria["aria-label"] ?? placeholder}
      >
        {({ side }) => (
          <Menu
            sections={menuSections}
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder={searchPlaceholder}
            showSearch={showSearch}
            filtering={filtering}
            onSearchTextChange={onSearchTextChange}
            isLoading={isLoading}
            initialSelectedId={value}
            preserveSectionsOnSearch
            onSelect={(item) => {
              onChange(item.id);
              setOpen(false);
            }}
            onDismiss={() => setOpen(false)}
          />
        )}
      </Popover>
    </>
  );
}
