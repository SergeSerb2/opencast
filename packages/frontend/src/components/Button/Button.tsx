import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ImageLike, KeyboardShortcut } from "@surgecast/protocol";
import { Image } from "../../icons/Image";
import { Shortcut } from "../Keycap/Keycap";
import "./button.css";

export type ButtonVariant = "default" | "secondary" | "destructive" | "ghost" | "standout" | "glass" | "primary";
export type ButtonSize = "mini" | "small" | "medium" | "large";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ImageLike;
  shortcut?: KeyboardShortcut;
  children?: ReactNode;
}

const ICON_SIZE: Record<ButtonSize, number> = { mini: 12, small: 16, medium: 16, large: 16 };

/** Text button (§8.4 Buttons). `glass` and `primary` are the macOS native-style pills. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "medium", icon, shortcut, children, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`sc-button${className ? ` ${className}` : ""}`}
      data-variant={variant}
      data-size={size}
      data-has-icon={icon ? "" : undefined}
      {...rest}
    >
      {icon !== undefined && <Image source={icon} size={ICON_SIZE[size]} />}
      {children !== undefined && <span className="sc-button__label">{children}</span>}
      {shortcut && <Shortcut shortcut={shortcut} />}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: ImageLike;
  /** Accessible label (also the tooltip). */
  label: string;
  variant?: "tertiary" | "secondary" | "glass" | "primary";
  size?: number;
  iconSize?: number;
}

/** Square icon button: tertiary (transparent), secondary (fg-10), glass, or primary. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = "tertiary", size = 24, iconSize = 16, className, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`sc-icon-button${variant === "glass" ? " sc-glass-control sc-glass-press" : ""}${className ? ` ${className}` : ""}`}
      data-variant={variant}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Image source={icon} size={iconSize} />
    </button>
  );
});
