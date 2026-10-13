import { memo, useState, type CSSProperties } from "react";
import type { ColorLike, ImageLike, ImageMask } from "@surgecast/protocol";
import { getEnv } from "../bridge/env";
import { useTheme } from "../theme/ThemeProvider";
import { resolveColor } from "./colors";
import { EmptyIconSlot } from "./glyphs";
import { Icon } from "./Icon";
import { fileIconUrl, isImageObject, resolveImage, resolveSourceString, pickSource, type ResolvedImage } from "./image-source";
import { TileImageView } from "./TileImage";

export interface ImageProps {
  source: ImageLike | null | undefined;
  /** Box size in px (icons render at this size; images fit inside). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Show the dashed empty slot when there is nothing to draw (list rows do). */
  placeholder?: boolean;
  /** Overrides the ImageObject's tintColor. */
  tintColor?: ColorLike;
  alt?: string;
}

function fileIconFallback(path: string): ResolvedImage {
  if (/\.app\/?$/i.test(path)) return { kind: "tile", tile: { glyph: "app-window-16", background: ["#8E9BB0", "#5D6980"] } };
  if (path.endsWith("/") || !/\.[a-z0-9]{1,8}$/i.test(path)) return { kind: "tile", tile: { glyph: "folder-16", background: ["#6CC4FF", "#2F8CEB"] } };
  return { kind: "icon", name: "blank-document-16" };
}

/**
 * Renders any Raycast `Image.ImageLike`: Icon enum glyphs, emoji, URLs, local
 * paths (`surgecast-file://`), Finder icons (`surgecast-icon://`), tiles,
 * light/dark pairs, tint colors and circle/rounded-rectangle masks, with fallback.
 */
export const Image = memo(function Image({ source, size = 16, className, style, placeholder = false, tintColor, alt = "" }: ImageProps) {
  const { appearance } = useTheme();
  const [failed, setFailed] = useState(false);
  const object = source && isImageObject(source) ? source : null;
  const mask: ImageMask | undefined = object?.mask;
  const tint = resolveColor(tintColor ?? object?.tintColor, appearance);

  let resolved = resolveImage(source, appearance);
  if (resolved.kind === "file-icon" && !getEnv().native) resolved = fileIconFallback(resolved.path);
  if ((failed || resolved.kind === "none") && object?.fallback) resolved = resolveSourceString(pickSource(object.fallback, appearance));

  const boxStyle: CSSProperties = { width: size, height: size, ...style };
  const cls = `sc-image${className ? ` ${className}` : ""}`;

  switch (resolved.kind) {
    case "icon":
      return <Icon name={resolved.name} size={size} color={tint} className={className} style={style} />;
    case "tile":
      return <TileImageView tile={resolved.tile} size={size} className={className} style={style} />;
    case "emoji":
      return (
        <span className={cls} style={boxStyle} role={alt ? "img" : undefined} aria-label={alt || undefined}>
          <span
            className="sc-emoji"
            data-tinted={tint ? "" : undefined}
            style={{ fontSize: Math.max(8, size - 2), ...(tint ? ({ "--sc-emoji-tint": tint } as CSSProperties) : null) }}
          >
            {resolved.text}
          </span>
        </span>
      );
    case "url":
    case "file-icon": {
      const url = resolved.kind === "url" ? resolved.url : fileIconUrl(resolved.path, size);
      if (failed && !object?.fallback) return placeholder ? <EmptyIconSlot size={size} /> : <Icon name="app-window-16" size={size} className={className} />;
      if (tint) {
        const maskImage = `url("${url.replace(/"/g, '\\"')}")`;
        return (
          <span className={cls} style={boxStyle} data-mask={mask}>
            <span className="sc-image-tinted" style={{ backgroundColor: tint, WebkitMaskImage: maskImage, maskImage }} />
          </span>
        );
      }
      return (
        <span className={cls} style={boxStyle} data-mask={mask}>
          <img src={url} alt={alt} draggable={false} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        </span>
      );
    }
    default:
      return placeholder ? <EmptyIconSlot size={size} /> : null;
  }
});
