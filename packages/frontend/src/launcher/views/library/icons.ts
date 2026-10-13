import type { TileImage } from "@surgecast/protocol";

/** A glyph on a neutral rounded tile, as Raycast draws content rows (clipboard text, snippets). */
export function glyphTile(glyph: string): TileImage {
  return { tile: { glyph, background: "var(--fg-10)", foreground: "var(--color-text-primary)" } };
}

/** A small filled dot in a theme color (tag filters, tag lists). */
export function colorDot(color: string) {
  return { source: "circle-filled-16", tintColor: color };
}

const TAG_COLORS = ["raycast-blue", "raycast-green", "raycast-magenta", "raycast-orange", "raycast-purple", "raycast-red", "raycast-yellow"];

/** Stable color per tag name. */
export function tagColor(tag: string): string {
  let hash = 0;
  for (const ch of tag) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
