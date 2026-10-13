import { memo, type CSSProperties, type ReactNode } from "react";
import type { ColorLike, ImageLike } from "@surgecast/protocol";
import { namedColorHue, resolveColor } from "../../icons/colors";
import { Image } from "../../icons/Image";
import { useTheme } from "../../theme/ThemeProvider";
import "./badge.css";

/** Fill/text colors for a tinted token: named theme hues use their contrast-safe variants. */
function tintStyle(color: ColorLike | undefined, appearance: "dark" | "light", strength: 10 | 20): CSSProperties | undefined {
  if (!color) return undefined;
  const hue = namedColorHue(color);
  if (hue) return { background: `var(--${hue}-${strength})`, color: `var(--${hue}-on-tint-${strength})` };
  const css = resolveColor(color, appearance);
  if (!css || css.startsWith("var(")) return { color: css };
  return { background: `color-mix(in srgb, ${css} ${strength}%, transparent)`, color: css };
}

export interface TagProps {
  children: ReactNode;
  color?: ColorLike;
  icon?: ImageLike;
  size?: "small" | "medium";
  title?: string;
}

/** Metadata / accessory tag: 20px token, 11px text, radius 6 (§5.9). */
export const Tag = memo(function Tag({ children, color, icon, size = "small", title }: TagProps) {
  const { appearance } = useTheme();
  return (
    <span className="sc-tag" data-size={size} data-has-icon={icon ? "" : undefined} style={tintStyle(color, appearance, 20)} title={title}>
      {icon && <Image source={icon} size={size === "small" ? 16 : 16} />}
      <span className="sc-truncate">{children}</span>
    </span>
  );
});

export interface BadgeProps {
  children?: ReactNode;
  color?: "gray" | "blue" | "green" | "orange" | "red" | "yellow" | "purple" | "magenta";
  size?: "small" | "medium" | "large";
  icon?: ImageLike;
  standout?: boolean;
}

/** Pill badge (§5.9). */
export const Badge = memo(function Badge({ children, color = "gray", size = "small", icon, standout = false }: BadgeProps) {
  return (
    <span className="sc-badge" data-color={color} data-size={size} data-standout={standout || undefined} data-has-icon={icon ? "" : undefined}>
      {icon && <Image source={icon} size={size === "small" ? 12 : 16} />}
      {children}
    </span>
  );
});

/** Numeric count badge. */
export const NumberBadge = memo(function NumberBadge({ value, size = "small", accent = false }: { value: number | string; size?: "small" | "large"; accent?: boolean }) {
  return (
    <span className="sc-number-badge" data-size={size} data-accent={accent || undefined}>
      {value}
    </span>
  );
});

/** Alias shown in root search: 18px token, spaces as ␣ (§5.9). */
export const AliasBadge = memo(function AliasBadge({ alias, variant = "filled" }: { alias: string; variant?: "filled" | "outlined" }) {
  return (
    <span className="sc-alias" data-variant={variant} data-single-space={alias === " " || undefined}>
      {alias.replace(/ /g, "␣")}
    </span>
  );
});
