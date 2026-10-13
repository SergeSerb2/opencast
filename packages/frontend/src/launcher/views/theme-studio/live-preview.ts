import { useEffect } from "react";
import { applyRootAttributes, useTheme } from "../../../theme/ThemeProvider";
import type { Palette } from "../../../theme/palettes";
import { cssVarsToRule, paletteToCssVars } from "../../../theme/theme-vars";

const STYLE_ID = "sc-preview-theme";
const PREVIEW_CLASS = "sc-preview-theme";
/** One class more specific than the provider's `:root.theme-root.active-theme` rule, so the preview wins. */
const PREVIEW_SELECTOR = `:root.theme-root.active-theme.${PREVIEW_CLASS}`;

/**
 * Every theme variable for `palette`, including the contrast-corrected ones.
 * Built-in defaults normally rely on tokens.css for those, but a preview must
 * override all of them or the active theme's values would show through.
 */
export function previewCssVars(palette: Palette): Record<string, string> {
  return paletteToCssVars({ ...palette, id: `preview:${palette.id}` });
}

export function previewStyleSheet(palette: Palette): string {
  return cssVarsToRule(PREVIEW_SELECTOR, previewCssVars(palette));
}

function applyPreview(palette: Palette): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = previewStyleSheet(palette);
  const root = document.documentElement;
  root.classList.add(PREVIEW_CLASS);
  root.toggleAttribute("dark", palette.appearance === "dark");
  root.toggleAttribute("light", palette.appearance === "light");
}

function clearPreview(appearance: Palette["appearance"]): void {
  document.getElementById(STYLE_ID)?.remove();
  document.documentElement.classList.remove(PREVIEW_CLASS);
  applyRootAttributes(document.documentElement, appearance);
}

/**
 * Shows `palette` on the whole launcher window without saving it; passing null
 * (or unmounting) restores the active theme. Runs as a passive effect so it is
 * applied after the theme provider rewrites the root attributes.
 */
export function useLiveThemePreview(palette: Palette | null): void {
  const active = useTheme();
  useEffect(() => {
    if (!palette) return;
    applyPreview(palette);
    return () => clearPreview(active.appearance);
  }, [palette, active.appearance, active.palette]);
}
