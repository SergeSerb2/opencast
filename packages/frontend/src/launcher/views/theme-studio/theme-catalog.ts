import type { Appearance as AppearanceSetting, Theme } from "@opencast/protocol";
import { BUILTIN_PALETTES, defaultPalette, paletteFromTheme, type Palette } from "../../../theme/palettes";

type ThemeAppearance = Palette["appearance"];

/** A theme the user can pick: a built-in palette or a saved user theme. */
export interface CatalogTheme {
  palette: Palette;
  builtin: boolean;
  /** Other ids stored for the same theme (the backend's copies of built-in palettes). */
  aliases: string[];
  /** The stored record, for themes that come from `themes.list`. */
  theme?: Theme;
}

export type AppearanceFilter = "all" | ThemeAppearance;

export interface CatalogSection {
  id: ThemeAppearance;
  title: string;
  items: CatalogTheme[];
}

/** How a row shows that it is in use: the theme in use, or the system-appearance theme for dark/light. */
export type CurrentMark = "current" | "dark" | "light" | null;

export interface ThemeSettings {
  appearance: AppearanceSetting;
  themeDark: string;
  themeLight: string;
}

/**
 * Built-in palettes first (in their design order), then user themes by name.
 * Records from `themes.list` that duplicate a built-in palette (same id, or a
 * backend built-in with the same name and appearance) become aliases of it.
 */
export function buildThemeCatalog(userThemes: readonly Theme[]): CatalogTheme[] {
  const builtins: CatalogTheme[] = BUILTIN_PALETTES.map((palette) => ({ palette, builtin: true, aliases: [] }));
  const others: CatalogTheme[] = [];
  for (const theme of userThemes) {
    const twin = builtins.find((b) => b.palette.id === theme.id || (theme.builtin && b.palette.name === theme.name && b.palette.appearance === theme.appearance));
    if (twin) {
      if (twin.palette.id !== theme.id && !twin.aliases.includes(theme.id)) twin.aliases.push(theme.id);
      continue;
    }
    others.push({ palette: paletteFromTheme(theme), builtin: Boolean(theme.builtin), aliases: [], theme });
  }
  others.sort((a, b) => Number(b.builtin) - Number(a.builtin) || a.palette.name.localeCompare(b.palette.name));
  return [...builtins, ...others];
}

export function matchesId(entry: CatalogTheme, id: string): boolean {
  return entry.palette.id === id || entry.aliases.includes(id);
}

export function findCatalogTheme(catalog: readonly CatalogTheme[], id: string | null | undefined): CatalogTheme | undefined {
  return id ? catalog.find((entry) => matchesId(entry, id)) : undefined;
}

/** The catalog entry in use for an appearance; unknown ids fall back to the default palette, like the theme provider does. */
export function themeInUse(catalog: readonly CatalogTheme[], id: string, appearance: ThemeAppearance): CatalogTheme | undefined {
  const entry = catalog.find((e) => e.palette.appearance === appearance && matchesId(e, id));
  return entry ?? findCatalogTheme(catalog, defaultPalette(appearance).id);
}

/**
 * With a fixed appearance only the theme on screen is "current"; when the
 * appearance follows the system, the dark and the light theme are both marked.
 */
export function currentMark(entry: CatalogTheme, catalog: readonly CatalogTheme[], settings: ThemeSettings): CurrentMark {
  const inUse = (appearance: ThemeAppearance) => themeInUse(catalog, appearance === "dark" ? settings.themeDark : settings.themeLight, appearance) === entry;
  if (settings.appearance === "system") return inUse(entry.palette.appearance) ? entry.palette.appearance : null;
  return entry.palette.appearance === settings.appearance && inUse(settings.appearance) ? "current" : null;
}

export function filterCatalog(catalog: readonly CatalogTheme[], query: string, filter: AppearanceFilter): CatalogTheme[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((entry) => (filter === "all" || entry.palette.appearance === filter) && (!q || entry.palette.name.toLowerCase().includes(q)));
}

export function catalogSections(items: readonly CatalogTheme[]): CatalogSection[] {
  const sections: CatalogSection[] = [
    { id: "dark", title: "Dark Themes", items: items.filter((e) => e.palette.appearance === "dark") },
    { id: "light", title: "Light Themes", items: items.filter((e) => e.palette.appearance === "light") },
  ];
  return sections.filter((s) => s.items.length > 0);
}

export function appearanceLabel(appearance: ThemeAppearance): string {
  return appearance === "dark" ? "Dark" : "Light";
}

const SUN_RAYS = [0, 45, 90, 135, 180, 225, 270, 315]
  .map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const p = (r: number) => `${(11 + Math.cos(rad) * r).toFixed(2)} ${(11 + Math.sin(rad) * r).toFixed(2)}`;
    return `M${p(4.4)}L${p(5.8)}`;
  })
  .join("");

/**
 * Row icon for a theme: a disc filled with the theme's background gradient and
 * a sun or moon in its text color, as an SVG data URL.
 */
export function themeSwatchIcon(palette: Palette): string {
  const { background, backgroundSecondary, text } = palette.colors;
  const glyph =
    palette.appearance === "dark"
      ? `<mask id="m"><rect width="22" height="22" fill="#fff"/><circle cx="13.7" cy="8.5" r="3.9" fill="#000"/></mask><circle cx="11" cy="11" r="4.9" fill="${text}" mask="url(#m)"/>`
      : `<circle cx="11" cy="11" r="2.6" fill="${text}"/><path d="${SUN_RAYS}" stroke="${text}" stroke-width="1.3" stroke-linecap="round"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${background}"/><stop offset="1" stop-color="${backgroundSecondary}"/></linearGradient></defs>` +
    `<circle cx="11" cy="11" r="10.25" fill="url(#g)" stroke="${text}" stroke-opacity="0.28" stroke-width="0.75"/>` +
    glyph +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
