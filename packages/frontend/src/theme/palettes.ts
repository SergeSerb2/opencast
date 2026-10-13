import type { Theme } from "@opencast/protocol";

/** A full palette: the Theme colors with a resolved accent (themes may omit it; a system accent still wins in CSS). */
export interface Palette {
  id: string;
  name: string;
  appearance: "dark" | "light";
  colors: Theme["colors"] & { accent: string };
}

const DEFAULT_ACCENT = "#4FA3F8";

/** Built-in palettes (design spec §2.5). "opencast-dark/light" are the defaults. */
export const BUILTIN_PALETTES: readonly Palette[] = [
  {
    id: "opencast-dark",
    name: "OpenCast Dark",
    appearance: "dark",
    colors: { background: "#000000", backgroundSecondary: "#000000", text: "#FFFFFF", accent: DEFAULT_ACCENT, selection: "#FFFFFF", loader: "#FFFFFF", red: "#FF6363", orange: "#FF9217", yellow: "#FFC531", green: "#59D499", blue: "#56C2FF", purple: "#A485FF", magenta: "#CF2F98" },
  },
  {
    id: "opencast-light",
    name: "OpenCast Light",
    appearance: "light",
    colors: { background: "#FFFFFF", backgroundSecondary: "#FFFFFF", text: "#000000", accent: "#138AF2", selection: "#000000", loader: "#000000", red: "#B12424", orange: "#C75D07", yellow: "#F8A300", green: "#006B4F", blue: "#138AF2", purple: "#6A3DEC", magenta: "#9A1B6E" },
  },
  {
    id: "sky",
    name: "Sky",
    appearance: "dark",
    colors: { background: "#0E1C3F", backgroundSecondary: "#173036", text: "#D7F0F4", accent: DEFAULT_ACCENT, selection: "#6688FF", loader: "#47FFFF", red: "#ED5959", orange: "#ED8659", yellow: "#EDD559", green: "#47FF91", blue: "#1A9FFF", purple: "#7759ED", magenta: "#ED59B2" },
  },
  {
    id: "sunset",
    name: "Sunset",
    appearance: "dark",
    colors: { background: "#451A08", backgroundSecondary: "#0A3943", text: "#FADDD1", accent: DEFAULT_ACCENT, selection: "#7698EF", loader: "#47E0FF", red: "#ED5959", orange: "#ED8659", yellow: "#EDD559", green: "#59ED7A", blue: "#30BBE8", purple: "#7759ED", magenta: "#ED59B2" },
  },
  {
    id: "midnight",
    name: "Midnight",
    appearance: "dark",
    colors: { background: "#070034", backgroundSecondary: "#11005B", text: "#FAF0FF", accent: DEFAULT_ACCENT, selection: "#B1A7FF", loader: "#F4C4FF", red: "#F84141", orange: "#FFC100", yellow: "#FEFF7F", green: "#63BA89", blue: "#6AB7FB", purple: "#C58AFA", magenta: "#FF5DB3" },
  },
  {
    id: "dawn",
    name: "Dawn",
    appearance: "light",
    colors: { background: "#FFF1F7", backgroundSecondary: "#D0C1FF", text: "#120032", accent: DEFAULT_ACCENT, selection: "#602AFF", loader: "#5A00FF", red: "#E14848", orange: "#E5753C", yellow: "#B7B400", green: "#00AC5D", blue: "#4F80FF", purple: "#9454FF", magenta: "#D756BF" },
  },
  {
    id: "overcast",
    name: "Overcast",
    appearance: "light",
    colors: { background: "#D9F9FF", backgroundSecondary: "#C7E0FC", text: "#002369", accent: DEFAULT_ACCENT, selection: "#0075FF", loader: "#0019FF", red: "#EE5050", orange: "#FA8542", yellow: "#EBA200", green: "#30B475", blue: "#5271D8", purple: "#B35AEB", magenta: "#DD43A7" },
  },
  {
    id: "noon",
    name: "Noon",
    appearance: "light",
    colors: { background: "#FFE7C6", backgroundSecondary: "#FCBFA5", text: "#1E003C", accent: DEFAULT_ACCENT, selection: "#7B46FF", loader: "#6100FF", red: "#DA4C4C", orange: "#D76F33", yellow: "#D49200", green: "#09B664", blue: "#5876D8", purple: "#A543E3", magenta: "#C4228B" },
  },
];

export function paletteFromTheme(theme: Theme): Palette {
  return {
    id: theme.id,
    name: theme.name,
    appearance: theme.appearance,
    colors: { ...theme.colors, accent: theme.colors.accent ?? (theme.appearance === "light" ? "#138AF2" : DEFAULT_ACCENT) },
  };
}

export function defaultPalette(appearance: "dark" | "light"): Palette {
  return BUILTIN_PALETTES[appearance === "dark" ? 0 : 1];
}

/** Find a palette by id among user themes and built-ins; fall back to the default for the appearance. */
export function resolvePalette(id: string | undefined, appearance: "dark" | "light", userThemes: readonly Theme[] = []): Palette {
  const user = userThemes.find((t) => t.id === id && t.appearance === appearance);
  if (user) return paletteFromTheme(user);
  const builtin = BUILTIN_PALETTES.find((p) => p.id === id && p.appearance === appearance);
  return builtin ?? defaultPalette(appearance);
}
