import type { ImageLike, TileImage, WindowLayoutRect } from "@opencast/protocol";

/** Same gradient the backend uses for window layout commands in root search. */
const TILE_TOP = "#3B82F6";
const TILE_BOTTOM = "#1D4ED8";

const MARKER = 'data-opencast="layout-thumbnail"';
const LEGACY_MARKER = 'data-surgecast="layout-thumbnail"';
const PREFIX = "data:image/svg+xml,";

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Command-tile style icon (rounded blue square) with a screen outline and the
 * layout's window filled in, as an SVG data URL. Saved as the layout's icon
 * when the user keeps the automatic icon, so root search shows the geometry
 * like the built-in window commands do.
 */
export function layoutThumbnail(rect: WindowLayoutRect): string {
  const screen = { x: 12, y: 16, width: 40, height: 32 };
  const inset = 3;
  const x = screen.x + inset + rect.x * (screen.width - inset * 2);
  const y = screen.y + inset + rect.y * (screen.height - inset * 2);
  const width = Math.max(rect.width * (screen.width - inset * 2), 1.5);
  const height = Math.max(rect.height * (screen.height - inset * 2), 1.5);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ${MARKER} viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TILE_TOP}"/><stop offset="1" stop-color="${TILE_BOTTOM}"/></linearGradient></defs>` +
    `<rect width="64" height="64" rx="14.7" fill="url(#g)"/>` +
    `<rect x="${screen.x}" y="${screen.y}" width="${screen.width}" height="${screen.height}" rx="4.5" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="2.5"/>` +
    `<rect x="${round(x)}" y="${round(y)}" width="${round(width)}" height="${round(height)}" rx="1.5" fill="#fff"/>` +
    `</svg>`;
  return `${PREFIX}${encodeURIComponent(svg)}`;
}

/** True for icons produced by `layoutThumbnail` (the "Automatic" choice). */
export function isLayoutThumbnail(icon: ImageLike | undefined): boolean {
  return typeof icon === "string" && icon.startsWith(PREFIX) &&
    [MARKER, LEGACY_MARKER].some(marker => icon.includes(encodeURIComponent(marker)));
}

/** A glyph on the window-management tile gradient. */
export function glyphTile(glyph: string): TileImage {
  return { tile: { glyph, background: [TILE_TOP, TILE_BOTTOM] } };
}

/** Glyphs offered by the icon picker. */
export const ICON_GLYPHS: { glyph: string; title: string }[] = [
  { glyph: "app-window-16", title: "Window" },
  { glyph: "app-window-sidebar-left-16", title: "Sidebar Left" },
  { glyph: "app-window-sidebar-right-16", title: "Sidebar Right" },
  { glyph: "app-window-grid-2x2-16", title: "Grid" },
  { glyph: "app-window-list-16", title: "List" },
  { glyph: "maximize-16", title: "Maximize" },
  { glyph: "minimize-16", title: "Minimize" },
  { glyph: "monitor-16", title: "Monitor" },
  { glyph: "code-16", title: "Code" },
  { glyph: "terminal-16", title: "Terminal" },
  { glyph: "globe-01-16", title: "Browser" },
  { glyph: "pencil-16", title: "Writing" },
  { glyph: "video-16", title: "Video" },
  { glyph: "music-16", title: "Music" },
  { glyph: "star-16", title: "Star" },
  { glyph: "bolt-16", title: "Bolt" },
];

/** Glyph of a picker tile, if `icon` is one. */
export function tileGlyph(icon: ImageLike | undefined): string | undefined {
  return icon && typeof icon === "object" && "tile" in icon ? icon.tile.glyph : undefined;
}
