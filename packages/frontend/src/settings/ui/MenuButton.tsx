import { useRef, useState, type ReactNode } from "react";
import type { ImageLike } from "@surgecast/protocol";
import { Button, IconButton, type ButtonProps } from "../../components/Button/Button";
import { Menu, type MenuItem, type MenuSection } from "../../components/Menu/Menu";
import { Popover } from "../../components/Popover/Popover";

export interface MenuButtonProps {
  sections: MenuSection[];
  onSelect: (item: MenuItem) => void;
  /** Button text; omit with `icon` for an icon-only trigger. */
  children?: ReactNode;
  icon?: ImageLike;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  searchPlaceholder?: string;
  /** Show the search field (default: when there are more than 8 items). */
  searchable?: boolean;
  align?: "start" | "end";
  width?: number;
  disabled?: boolean;
  emptyText?: string;
}

/** A button that opens a searchable menu (add pickers, "…" actions). */
export function MenuButton({
  sections,
  onSelect,
  children,
  icon,
  label,
  variant = "default",
  size = "small",
  searchPlaceholder = "Search…",
  searchable,
  align = "end",
  width = 260,
  disabled,
  emptyText,
}: MenuButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  const close = () => {
    setOpen(false);
    ref.current?.focus({ preventScroll: true });
  };
  return (
    <>
      {children === undefined && icon ? (
        <IconButton ref={ref} icon={icon} label={label ?? "More"} onClick={() => setOpen(!open)} data-state={open ? "open" : "closed"} disabled={disabled} aria-haspopup="menu" aria-expanded={open} />
      ) : (
        <Button ref={ref} variant={variant} size={size} icon={icon} onClick={() => setOpen(!open)} data-state={open ? "open" : "closed"} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
          {children}
        </Button>
      )}
      <Popover open={open} onClose={close} anchor={ref.current} side="bottom" align={align} width={width} role="dialog" aria-label={label ?? (typeof children === "string" ? children : "Menu")}>
        {({ side }) => (
          <Menu
            sections={sections}
            layout={side === "top" ? "up" : "down"}
            showSearch={searchable ?? count > 8}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            onSelect={(item) => {
              close();
              onSelect(item);
            }}
            onDismiss={close}
          />
        )}
      </Popover>
    </>
  );
}
