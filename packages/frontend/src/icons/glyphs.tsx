import type { SVGProps } from "react";

/** OpenCast's own glyphs, drawn on a 24×24 grid like lucide (stroke = currentColor). */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** The OpenCast mark: an open ring with a command prompt at its center. */
export function OpenCastLogo({ size = 22, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d="M17.85 5.45a8.8 8.8 0 1 0 0 13.1" strokeWidth="3" />
      <path d="m13.6 8.5 3.5 3.5-3.5 3.5" strokeWidth="2.7" />
    </svg>
  );
}

/** Root-search menu button glyph: two left-aligned bars of different length. */
export function MenuGlyph({ size = 18, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={1.5} aria-hidden="true" {...rest}>
      <path d="M3.5 6.75h13" />
      <path d="M3.5 11.25h8" />
    </svg>
  );
}

/** Raycast's `Number00`…`Number99` icons: a number in a rounded square. */
export function NumberGlyph({ value, size = 16, ...rest }: GlyphProps & { value: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...rest}>
      <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="8" y="8.4" textAnchor="middle" dominantBaseline="middle" fontSize={value.length > 1 ? 7 : 8.5} fontWeight="600" fill="currentColor" fontFamily="var(--font-ui)">
        {value}
      </text>
    </svg>
  );
}

/** Small "↗" used by metadata links. */
export function ArrowNeGlyph(props: GlyphProps) {
  return (
    <Svg strokeWidth={2} {...props}>
      <path d="M8 16 16 8" />
      <path d="M9 8h7v7" />
    </Svg>
  );
}

/** Placeholder slot for a missing icon (1px dashed, radius 4). */
export function EmptyIconSlot({ size = 16 }: { size?: number }) {
  return <span className="sc-icon-empty" style={{ width: size, height: size }} aria-hidden="true" />;
}
