import { memo, type CSSProperties } from "react";
import type { TileImage } from "@surgecast/protocol";
import { Icon } from "./Icon";

export interface TileImageViewProps {
  tile: TileImage["tile"];
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Built-in command tile: a rounded square with a top-to-bottom gradient, a
 * soft top highlight, a hairline edge and a white glyph.
 */
export const TileImageView = memo(function TileImageView({ tile, size = 22, className, style }: TileImageViewProps) {
  const [top, bottom] = Array.isArray(tile.background) ? tile.background : [tile.background, tile.background];
  const glyphSize = Math.round(size * 0.64);
  return (
    <span
      className={`sc-tile${className ? ` ${className}` : ""}`}
      style={{ width: size, height: size, background: `linear-gradient(180deg, ${top}, ${bottom})`, color: tile.foreground ?? "#fff", ...style }}
      aria-hidden="true"
    >
      <Icon name={tile.glyph} size={glyphSize} />
    </span>
  );
});
