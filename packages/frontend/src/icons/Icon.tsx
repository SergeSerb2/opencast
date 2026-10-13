import { memo, type CSSProperties, type ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { AppWindow } from "lucide-react";
import { FILLED_ALIASES, ICON_ALIASES } from "./icon-aliases";
import { FILLED_ICONS, RAYCAST_ICONS } from "./raycast-icons.generated";
import { MenuGlyph, NumberGlyph, SurgecastLogo } from "./glyphs";
import "./icons.css";

/** Glyphs drawn by Surgecast itself rather than lucide. */
const CUSTOM: Record<string, (props: { size: number; style?: CSSProperties; className?: string }) => ReactElement> = {
  "surgecast-logo": (p) => <SurgecastLogo {...p} />,
  "raycast-logo-neg-16": (p) => <SurgecastLogo {...p} />,
  "raycast-logo-pos-16": (p) => <SurgecastLogo {...p} />,
  "menu-20": (p) => <MenuGlyph {...p} />,
};

const NUMBER = /^number-(\d{2})-16$/;

/** Normalize "clipboard", "clipboard-16", "clipboard-20" → the enum value we have a glyph for. */
const known = (name: string) => name in CUSTOM || name in RAYCAST_ICONS || name in ICON_ALIASES || NUMBER.test(name);

export function resolveIconName(name: string): string | null {
  if (known(name)) return name;
  const base = name.replace(/-(16|20)$/, "");
  for (const candidate of [`${base}-16`, base]) if (known(candidate)) return candidate;
  return null;
}

export function isIconName(name: string): boolean {
  return resolveIconName(name) !== null;
}

export interface IconProps {
  /** Raycast `Icon` value ("clipboard-16"), a short name ("clipboard"), or a Surgecast glyph. */
  name: string;
  size?: number;
  /** Any CSS color; defaults to currentColor. */
  color?: string;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; icons are decorative by default. */
  label?: string;
}

/** A 16px-grid glyph in currentColor (lucide outlines at a 1.5px stroke). */
export const Icon = memo(function Icon({ name, size = 16, color, className, style, label }: IconProps) {
  const resolved = resolveIconName(name);
  const mergedStyle = color ? { ...style, color } : style;
  const cls = `sc-icon${className ? ` ${className}` : ""}`;
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };

  if (resolved && resolved in CUSTOM) {
    return (
      <span className={cls} style={{ ...mergedStyle, width: size, height: size }} {...a11y}>
        {CUSTOM[resolved]({ size })}
      </span>
    );
  }
  const number = resolved?.match(NUMBER);
  if (number) {
    return (
      <span className={cls} style={{ ...mergedStyle, width: size, height: size }} {...a11y}>
        <NumberGlyph value={String(Number(number[1]))} size={size} />
      </span>
    );
  }
  const Glyph: LucideIcon = (resolved && (RAYCAST_ICONS[resolved] ?? ICON_ALIASES[resolved])) || AppWindow;
  const filled = resolved !== null && (FILLED_ICONS.has(resolved) || FILLED_ALIASES.has(resolved));
  return (
    <Glyph
      className={`${cls}${filled ? " sc-icon--filled" : ""}`}
      style={mergedStyle}
      size={size}
      strokeWidth={size <= 12 ? 1.4 : size >= 20 ? 1.75 : 1.5}
      absoluteStrokeWidth
      {...a11y}
    />
  );
});
