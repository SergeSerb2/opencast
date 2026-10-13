import { useMemo, useRef, useState } from "react";
import type { ImageLike, WindowLayoutRect } from "@opencast/protocol";
import { Menu, Popover, type MenuSection } from "../../../components";
import { Icon } from "../../../icons/Icon";
import { Image } from "../../../icons/Image";
import { glyphTile, ICON_GLYPHS, layoutThumbnail, tileGlyph } from "./thumbnail";

const AUTOMATIC = "automatic";
const CURRENT = "current";

/**
 * Icon accessory of the name field. `undefined` means "Automatic": a
 * thumbnail of the layout, regenerated when the command is saved.
 */
export function IconPicker({ icon, rect, onChange }: { icon: ImageLike | undefined; rect: WindowLayoutRect; onChange: (icon: ImageLike | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const thumbnail = layoutThumbnail(rect);
  const glyph = tileGlyph(icon);
  const isListed = glyph !== undefined && ICON_GLYPHS.some((g) => g.glyph === glyph);
  const selectedId = icon === undefined ? AUTOMATIC : isListed ? glyph : CURRENT;

  const sections = useMemo<MenuSection[]>(
    () => [
      {
        id: "default",
        items: [
          { id: AUTOMATIC, title: "Automatic", icon: thumbnail, checked: selectedId === AUTOMATIC, keywords: ["layout", "preview"] },
          ...(selectedId === CURRENT && icon ? [{ id: CURRENT, title: "Current Icon", icon, checked: true }] : []),
        ],
      },
      { id: "icons", title: "Icons", items: ICON_GLYPHS.map((g) => ({ id: g.glyph, title: g.title, icon: glyphTile(g.glyph), checked: selectedId === g.glyph })) },
    ],
    [thumbnail, selectedId, icon],
  );

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sc-wm-icon-picker"
        data-state={open ? "open" : "closed"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Icon"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Image source={icon ?? thumbnail} size={16} />
        <Icon name="chevron-down-small-16" size={16} className="sc-wm-icon-picker__chevron" />
      </button>
      <Popover open={open} onClose={close} anchor={triggerRef.current} side="bottom" align="end" alignOffset={-4} width={220} role="dialog" aria-label="Choose an icon">
        {({ side }) => (
          <Menu
            sections={sections}
            layout={side === "top" ? "up" : "down"}
            searchPlaceholder="Search icons…"
            initialSelectedId={selectedId}
            preserveSectionsOnSearch
            onSelect={(item) => {
              if (item.id === AUTOMATIC) onChange(undefined);
              else if (item.id !== CURRENT) onChange(glyphTile(item.id));
              close();
            }}
            onDismiss={close}
          />
        )}
      </Popover>
    </>
  );
}
