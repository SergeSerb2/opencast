import { ensureContrast, mix, parseHex, toHex, type RGB } from "./color";
import type { Palette } from "./palettes";

const NAMED = ["red", "orange", "yellow", "green", "blue", "purple", "magenta"] as const;

/** tokens.css already holds the exact contrast values of the two default palettes (spec §2.4). */
const DEFAULT_PALETTE_IDS = new Set(["surgecast-dark", "surgecast-light"]);

/** The "typical backdrop" a theme is drawn on: bg/bg-secondary at 40% over a gray. */
export function typicalBackdrop(palette: Palette): RGB {
  const gray: RGB = palette.appearance === "dark" ? [0x50, 0x50, 0x50] : [0xc0, 0xc0, 0xc0];
  const bg = mix(parseHex(palette.colors.background), parseHex(palette.colors.backgroundSecondary), 0.5);
  return mix(gray, bg, 0.4);
}

/** CSS custom properties for a palette, written on `.theme-root.active-theme`. */
export function paletteToCssVars(palette: Palette): Record<string, string> {
  const c = palette.colors;
  const vars: Record<string, string> = {
    "--bg": c.background,
    "--bg-secondary": c.backgroundSecondary,
    "--fg": c.text,
    "--theme-accent": c.accent,
    "--selection": c.selection,
    "--loader": c.loader,
  };
  for (const name of NAMED) vars[`--${name}`] = c[name];

  if (DEFAULT_PALETTE_IDS.has(palette.id)) return vars;

  const backdrop = typicalBackdrop(palette);
  const contrast: Record<string, string> = {};
  for (const name of NAMED) {
    const color = parseHex(c[name]);
    contrast[name] = toHex(ensureContrast(color, backdrop));
    vars[`--${name}-contrast`] = contrast[name];
    vars[`--${name}-on-tint-10`] = toHex(ensureContrast(color, mix(backdrop, color, 0.1)));
    vars[`--${name}-on-tint-20`] = toHex(ensureContrast(color, mix(backdrop, color, 0.2)));
  }
  const fg = parseHex(c.text);
  const tokenBackdrop = mix(mix(backdrop, fg, 0.05), fg, 0.1);
  const fgCss = `${fg[0]} ${fg[1]} ${fg[2]}`;
  vars["--color-token-primary"] = c.text;
  vars["--color-token-secondary"] = `rgb(${fgCss} / 0.8)`;
  vars["--color-token-tertiary"] = `rgb(${fgCss} / 0.6)`;
  vars["--color-token-string"] = toHex(ensureContrast(parseHex(palette.appearance === "dark" ? c.red : c.blue), tokenBackdrop));
  vars["--color-token-highlight"] = toHex(ensureContrast(parseHex(palette.appearance === "dark" ? c.orange : c.purple), tokenBackdrop));
  return vars;
}

export function cssVarsToRule(selector: string, vars: Record<string, string>): string {
  const body = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
  return `${selector} {\n${body}\n}`;
}
