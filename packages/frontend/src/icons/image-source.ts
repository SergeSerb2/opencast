import type { FileIconImage, ImageLike, ImageObject, ImageSource, TileImage } from "@opencast/protocol";
import { isIconName } from "./Icon";

/** What an ImageLike resolves to, before rendering. */
export type ResolvedImage =
  | { kind: "icon"; name: string }
  | { kind: "emoji"; text: string }
  | { kind: "url"; url: string }
  | { kind: "file-icon"; path: string }
  | { kind: "tile"; tile: TileImage["tile"] }
  | { kind: "none" };

const EMOJI = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]️?⃣)/u;

export function isEmoji(text: string): boolean {
  if (!text || text.length > 16) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)];
  return segments.length === 1 && EMOJI.test(text);
}

export function isTileImage(image: ImageLike): image is TileImage {
  return typeof image === "object" && image !== null && "tile" in image;
}
export function isFileIconImage(image: ImageLike): image is FileIconImage {
  return typeof image === "object" && image !== null && "fileIcon" in image;
}
export function isImageObject(image: ImageLike): image is ImageObject {
  return typeof image === "object" && image !== null && "source" in image;
}

/** `opencast-file://` URL for an absolute local path (served by the native host). */
export function localFileUrl(path: string): string {
  return `opencast-file://${encodeURI(path).replace(/#/g, "%23").replace(/\?/g, "%3F")}`;
}

/** `opencast-icon://` URL for a Finder icon at a pixel size (2× for Retina). */
export function fileIconUrl(path: string, size: number): string {
  return `opencast-icon://file?path=${encodeURIComponent(path)}&size=${Math.round(size * 2)}`;
}

/** Pick the light/dark variant of a source. */
export function pickSource(source: ImageSource, appearance: "dark" | "light"): string {
  return typeof source === "string" ? source : source[appearance];
}

/** Classify a source string: glyph, emoji, URL or local path. */
export function resolveSourceString(source: string): ResolvedImage {
  const value = source.trim();
  if (!value) return { kind: "none" };
  if (/^(https?|data|blob|opencast-file|opencast-icon|surgecast-file|surgecast-icon):/i.test(value)) return { kind: "url", url: value };
  if (/^file:\/\//i.test(value)) return { kind: "url", url: localFileUrl(decodeURI(value.replace(/^file:\/\//i, ""))) };
  if (value.startsWith("/") || value.startsWith("~/")) return { kind: "url", url: localFileUrl(value) };
  if (isIconName(value)) return { kind: "icon", name: value };
  if (isEmoji(value)) return { kind: "emoji", text: value };
  // Relative names are extension assets the runtime should already have resolved.
  return { kind: "none" };
}

export function resolveImage(image: ImageLike | null | undefined, appearance: "dark" | "light"): ResolvedImage {
  if (image === null || image === undefined || image === "") return { kind: "none" };
  if (typeof image === "string") return resolveSourceString(image);
  if (isTileImage(image)) return { kind: "tile", tile: image.tile };
  if (isFileIconImage(image)) return { kind: "file-icon", path: image.fileIcon };
  if (isImageObject(image)) return resolveSourceString(pickSource(image.source, appearance));
  if ("light" in image && "dark" in image) return resolveSourceString(pickSource(image as { light: string; dark: string }, appearance));
  return { kind: "none" };
}
