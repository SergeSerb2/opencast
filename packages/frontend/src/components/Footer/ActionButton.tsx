import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ImageLike, KeyboardShortcut } from "@opencast/protocol";
import { Image } from "../../icons/Image";
import { Shortcut } from "../Keycap/Keycap";
import "./footer.css";

export interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ImageLike;
  /** Custom leading content instead of `icon`. */
  leading?: ReactNode;
  shortcut?: KeyboardShortcut;
  variant?: "primary" | "secondary" | "destructive";
  /** Hover fill extends 4px to fill the whole pill (single button in a pill). */
  outset?: boolean;
}

/** Footer pill button: 28px, 12px label, optional 18px icon and keycaps (§3.4). */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(function ActionButton(
  { title, subtitle, icon, leading, shortcut, variant = "primary", outset, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`sc-action-button${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-hover-variant={outset ? "outset" : undefined}
      data-icon-only={!title || undefined}
      onMouseDown={(e) => e.preventDefault()}
      {...rest}
    >
      {leading ?? (icon !== undefined && <Image source={icon} size={18} className="sc-action-button__icon" />)}
      {title !== undefined && <span className="sc-action-button__title">{title}</span>}
      {subtitle !== undefined && <span className="sc-action-button__subtitle">{subtitle}</span>}
      {shortcut && <Shortcut shortcut={shortcut} />}
    </button>
  );
});
