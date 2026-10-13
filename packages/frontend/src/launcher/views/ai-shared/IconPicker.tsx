import { useMemo, useRef, useState } from "react";
import { Menu, Popover, type MenuSection } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { AI_ICON_CHOICES, iconTitle } from "./icon-catalog";
import { DEFAULT_AI_ICON } from "./options";

const DEFAULT_ID = "default";

/** Icon button for the right edge of the name field (`TextField` accessory); "" is the default icon. */
export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sections = useMemo<MenuSection[]>(() => {
    const glyphs: string[] = [...AI_ICON_CHOICES];
    if (value && !glyphs.includes(value)) glyphs.unshift(value);
    return [
      { id: "default", items: [{ id: DEFAULT_ID, title: "Default", icon: DEFAULT_AI_ICON, checked: !value }] },
      { id: "glyphs", title: "Icons", items: glyphs.map((name) => ({ id: name, title: iconTitle(name), icon: name, checked: name === value })) },
    ];
  }, [value]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sc-ai-icon-picker"
        data-state={open ? "open" : "closed"}
        aria-label="Icon"
        aria-haspopup="menu"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Image source={value || DEFAULT_AI_ICON} size={16} />
        <Icon name="chevron-down-small-16" size={16} className="sc-ai-icon-picker__chevron" />
      </button>
      <Popover open={open} onClose={close} anchor={triggerRef.current} side="bottom" align="end" alignOffset={-4} width={240} role="dialog" aria-label="Choose Icon">
        {({ side }) => (
          <Menu
            sections={sections}
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Search icons…"
            initialSelectedId={value || DEFAULT_ID}
            preserveSectionsOnSearch
            onSelect={(item) => {
              onChange(item.id === DEFAULT_ID ? "" : item.id);
              close();
            }}
            onDismiss={close}
          />
        )}
      </Popover>
    </>
  );
}
