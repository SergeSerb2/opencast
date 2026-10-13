import { useEffect, useRef } from "react";
import type { ImageLike } from "@opencast/protocol";
import { HighlightedText } from "../../components/HighlightedText/HighlightedText";
import { Popover } from "../../components/Popover/Popover";
import { Image } from "../../icons/Image";

export interface TriggerItem {
  id: string;
  title: string;
  icon?: ImageLike;
  accessory?: string;
  ranges?: [number, number][];
}

export interface TriggerSection {
  title: string;
  items: TriggerItem[];
}

export interface TriggerMenuProps {
  open: boolean;
  anchor: HTMLElement | null;
  sections: TriggerSection[];
  selectedId: string | undefined;
  onHover: (id: string) => void;
  onPick: (id: string) => void;
  onClose: () => void;
  emptyText: string;
}

/**
 * Suggestions for `@` mentions and `/` commands. Keyboard focus stays in the
 * composer (it moves the selection); rows reuse the menu styles.
 */
export function TriggerMenu({ open, anchor, sections, selectedId, onHover, onPick, onClose, emptyText }: TriggerMenuProps) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  const visible = sections.filter((s) => s.items.length > 0);
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} side="top" align="start" offset={8} width={320} flip={false} className="sc-ai-trigger-menu" role="listbox" aria-label="Suggestions">
      <div ref={list} className="sc-menu sc-ai-trigger-menu__list" onMouseDown={(e) => e.preventDefault()}>
        {visible.length === 0 && <div className="sc-menu__empty">{emptyText}</div>}
        {visible.map((section, index) => (
          <div key={section.title} role="group" aria-label={section.title}>
            {index > 0 && <div className="sc-menu__separator" role="separator" />}
            <div className="sc-menu__header" data-first={index === 0 || undefined}>
              <span className="sc-truncate">{section.title}</span>
            </div>
            {section.items.map((item) => (
              <div
                key={item.id}
                role="option"
                aria-selected={item.id === selectedId}
                className="sc-menu__item"
                data-selected={item.id === selectedId || undefined}
                onMouseMove={() => item.id !== selectedId && onHover(item.id)}
                onClick={() => onPick(item.id)}
              >
                {item.icon !== undefined && <Image source={item.icon} size={16} className="sc-menu__icon" />}
                <span className="sc-menu__title sc-truncate">
                  <HighlightedText text={item.title} ranges={item.ranges} />
                </span>
                {item.accessory && (
                  <span className="sc-menu__accessories">
                    <span className="sc-menu__accessory-text sc-truncate">{item.accessory}</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </Popover>
  );
}
