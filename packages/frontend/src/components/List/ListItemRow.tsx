import { memo, type MouseEvent as ReactMouseEvent } from "react";
import { Image } from "../../icons/Image";
import { HighlightedText } from "../HighlightedText/HighlightedText";
import { Keycap } from "../Keycap/Keycap";
import { Tooltip } from "../Tooltip/Tooltip";
import { Accessories } from "./Accessories";
import { textTooltip, textValue, type ListItemModel } from "./model";

export type ListRowSize = "large" | "small" | "multiline";

export interface ListItemRowProps {
  item: ListItemModel;
  domId: string;
  selected: boolean;
  size: ListRowSize;
  /** Number hint shown while ⌘ is held ("1"…"9", "0"). */
  hint?: string;
  onMouseDown: (event: ReactMouseEvent) => void;
  onClick: (event: ReactMouseEvent) => void;
  onDoubleClick: (event: ReactMouseEvent) => void;
}

/** One list row: 38px, inset 8, radius 12; icon 22, title/subtitle 13px, accessories right (§3.3). */
export const ListItemRow = memo(function ListItemRow({ item, domId, selected, size, hint, onMouseDown, onClick, onDoubleClick }: ListItemRowProps) {
  const title = textValue(item.title);
  const subtitle = textValue(item.subtitle);
  const iconSize = size === "small" ? 16 : 22;
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-disabled={item.disabled || undefined}
      className="sc-list-item"
      data-size={size}
      data-selected={selected || undefined}
      data-disabled={item.disabled || undefined}
      data-custom={item.render ? "" : undefined}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {item.render ? (
        item.render({ selected })
      ) : (
        <div className="sc-list-item__content" data-hint={hint ? "" : undefined}>
          {item.icon !== undefined && (
            <span className="sc-list-item__icon" style={{ width: iconSize, height: iconSize }}>
              <Image source={item.icon} size={iconSize} placeholder />
              {item.iconDot && <span className="sc-list-item__dot" data-tone={item.iconDot} />}
            </span>
          )}
          <span className="sc-list-item__text">
            <TooltipText className="sc-list-item__title" text={title} tooltip={textTooltip(item.title)} ranges={item.titleRanges} />
            {subtitle && <TooltipText className="sc-list-item__subtitle" text={subtitle} tooltip={textTooltip(item.subtitle)} />}
          </span>
          <Accessories accessories={item.accessories} selected={selected} />
        </div>
      )}
      {hint && (
        <span className="sc-list-item__hint" aria-hidden="true">
          <Keycap>{hint}</Keycap>
        </span>
      )}
    </div>
  );
});

function TooltipText({ className, text, tooltip, ranges }: { className: string; text: string; tooltip?: string; ranges?: ListItemModel["titleRanges"] }) {
  const node = (
    <span className={`${className} sc-truncate`}>
      <HighlightedText text={text} ranges={ranges} />
    </span>
  );
  return tooltip ? <Tooltip content={tooltip}>{node}</Tooltip> : node;
}
