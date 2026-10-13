import { useMemo } from "react";
import type { Theme } from "@opencast/protocol";
import { useBackend } from "../bridge/hooks";
import { BUILTIN_PALETTES } from "../theme/palettes";

export interface ThemeOption {
  id: string;
  name: string;
  appearance: "dark" | "light";
  colors: Pick<Theme["colors"], "background" | "backgroundSecondary" | "text">;
  builtin: boolean;
}

/**
 * Themes for the appearance pickers: the backend's themes (built-in and
 * user-made) plus the frontend's bundled palettes the backend doesn't list,
 * de-duplicated by name.
 */
export function mergeThemeOptions(themes: readonly Theme[]): ThemeOption[] {
  const options: ThemeOption[] = themes.map((t) => ({ id: t.id, name: t.name, appearance: t.appearance, colors: t.colors, builtin: Boolean(t.builtin) }));
  for (const palette of BUILTIN_PALETTES) {
    if (options.some((o) => o.id === palette.id || (o.name === palette.name && o.appearance === palette.appearance))) continue;
    options.push({ id: palette.id, name: palette.name, appearance: palette.appearance, colors: palette.colors, builtin: true });
  }
  return options.sort((a, b) => Number(b.builtin) - Number(a.builtin));
}

export function useThemeOptions(): ThemeOption[] {
  const { data } = useBackend("themes.list", undefined);
  return useMemo(() => mergeThemeOptions(data ?? []), [data]);
}

const MOON = "M18.4 9.6a6.6 6.6 0 1 0 4 11.6 7.4 7.4 0 0 1-4-11.6Z";
const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const [x1, y1, x2, y2] = [16 + Math.cos(rad) * 7, 16 + Math.sin(rad) * 7, 16 + Math.cos(rad) * 9.2, 16 + Math.sin(rad) * 9.2].map((n) => n.toFixed(2));
    return `M${x1} ${y1}L${x2} ${y2}`;
  })
  .join("");

/**
 * Circular theme icon (§8.3): a vertical gradient between the theme's two
 * background colors with a moon (dark) or sun (light) in its text color.
 * Returned as an SVG data URL so it works anywhere an ImageLike does.
 */
export function themeIcon(theme: Pick<ThemeOption, "appearance" | "colors">): string {
  const { background, backgroundSecondary, text } = theme.colors;
  const glyph =
    theme.appearance === "dark"
      ? `<path d="${MOON}" fill="${text}"/>`
      : `<circle cx="16" cy="16" r="4.4" fill="${text}"/><path d="${SUN_RAYS}" stroke="${text}" stroke-width="2" stroke-linecap="round"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${backgroundSecondary}"/></linearGradient></defs>` +
    `<circle cx="16" cy="16" r="15.5" fill="url(#g)" stroke="${text}" stroke-opacity="0.2"/>${glyph}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
