import type { BackendParams, Theme } from "@opencast/protocol";
import type { Palette } from "../../../theme/palettes";

/** Editable colors, in the order the editor lists them. */
export const COLOR_KEYS = ["background", "backgroundSecondary", "text", "accent", "selection", "loader", "red", "orange", "yellow", "green", "blue", "purple", "magenta"] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];
export type ThemeAppearance = Palette["appearance"];

export interface ColorGroup {
  title: string;
  fields: { key: ColorKey; label: string }[];
}

export const COLOR_GROUPS: readonly ColorGroup[] = [
  {
    title: "Background",
    fields: [
      { key: "background", label: "Start Color" },
      { key: "backgroundSecondary", label: "End Color" },
    ],
  },
  {
    title: "Primary Colors",
    fields: [
      { key: "text", label: "Text" },
      { key: "accent", label: "Accent" },
      { key: "selection", label: "Selection" },
      { key: "loader", label: "Loader" },
    ],
  },
  {
    title: "Support Colors",
    fields: [
      { key: "red", label: "Red" },
      { key: "orange", label: "Orange" },
      { key: "yellow", label: "Yellow" },
      { key: "green", label: "Green" },
      { key: "blue", label: "Blue" },
      { key: "purple", label: "Purple" },
      { key: "magenta", label: "Magenta" },
    ],
  },
];

/** A theme being edited. Color values are the raw field text until saved. */
export interface ThemeDraft {
  /** Id of the user theme being edited; absent for new themes and copies of built-ins. */
  id?: string;
  name: string;
  appearance: ThemeAppearance;
  colors: Record<ColorKey, string>;
}

export type DraftErrors = Partial<Record<"name" | ColorKey, string>>;

export const HEX_ERROR = "Use a hex color like #4FA3F8";
export const NAME_ERROR = "Give the theme a name";

/** `#abc`, `abc`, `#aabbcc` or `aabbcc` (any case) → `#AABBCC`; anything else → null. */
export function normalizeHex(input: string): string | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return `#${digits.toUpperCase()}`;
}

/**
 * The color to show in the live preview while a field is being typed: only
 * complete six-digit values, so "#4FA" on the way to "#4FA3F8" does not flash.
 */
export function previewHex(input: string): string | null {
  return /^#?[0-9a-f]{6}$/i.test(input.trim()) ? normalizeHex(input) : null;
}

export function draftFromPalette(palette: Palette, options: { id?: string; name?: string } = {}): ThemeDraft {
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => [key, palette.colors[key].toUpperCase()])) as Record<ColorKey, string>;
  return { id: options.id, name: options.name ?? palette.name, appearance: palette.appearance, colors };
}

/** Name for a copy: "Sky" → "Sky Copy", avoiding names that already exist ("Sky Copy 2"). */
export function copyName(name: string, existing: readonly string[] = []): string {
  const base = `${name.trim() || "Untitled"} Copy`;
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

export function validateDraft(draft: ThemeDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = NAME_ERROR;
  for (const key of COLOR_KEYS) if (!normalizeHex(draft.colors[key])) errors[key] = HEX_ERROR;
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Palette for previews: invalid or incomplete colors fall back to `fallback`. */
export function draftToPalette(draft: ThemeDraft, fallback: Palette, id = "draft"): Palette {
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => [key, previewHex(draft.colors[key]) ?? fallback.colors[key]])) as Palette["colors"];
  return { id, name: draft.name.trim() || "Untitled", appearance: draft.appearance, colors };
}

/** `themes.upsert` params for a valid draft (colors normalized to #RRGGBB). */
export function draftToUpsert(draft: ThemeDraft): BackendParams<"themes.upsert"> {
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => [key, normalizeHex(draft.colors[key]) ?? draft.colors[key]])) as Theme["colors"];
  return { ...(draft.id ? { id: draft.id } : {}), name: draft.name.trim(), appearance: draft.appearance, colors };
}

export function isSameDraft(a: ThemeDraft, b: ThemeDraft): boolean {
  if (a.name.trim() !== b.name.trim() || a.appearance !== b.appearance) return false;
  return COLOR_KEYS.every((key) => (normalizeHex(a.colors[key]) ?? a.colors[key]) === (normalizeHex(b.colors[key]) ?? b.colors[key]));
}

/** Shareable JSON for a theme (the same shape `parseThemeJson` reads back). */
export function themeToJson(draft: ThemeDraft): string {
  const { name, appearance, colors } = draftToUpsert(draft);
  return JSON.stringify({ name, appearance, colors }, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read a theme from JSON: `{ name, appearance, colors: { … } }`. Colors may sit
 * at the top level too, `foreground` is accepted for `text`, and a missing
 * accent defaults to `fallbackAccent`. Returns null when the JSON is not a theme.
 */
export function parseThemeJson(text: string, fallbackAccent: string): ThemeDraft | null {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const source = isRecord(data.colors) ? data.colors : data;
  const read = (key: string): string | null => (typeof source[key] === "string" ? normalizeHex(source[key]) : null);
  const colors: Partial<Record<ColorKey, string>> = {};
  for (const key of COLOR_KEYS) {
    const value = key === "text" ? (read("text") ?? read("foreground")) : key === "accent" ? (read("accent") ?? normalizeHex(fallbackAccent)) : read(key);
    if (!value) return null;
    colors[key] = value;
  }
  const appearance = data.appearance === "light" || data.appearance === "dark" ? data.appearance : null;
  if (!appearance) return null;
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Imported Theme";
  return { name, appearance, colors: colors as Record<ColorKey, string> };
}
