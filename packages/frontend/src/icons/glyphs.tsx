import type { SVGProps } from "react";

/** Surgecast's own glyphs, drawn on a 24×24 grid like lucide (stroke = currentColor). */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** The Surgecast mark: a rising wave inside a rounded diamond. */
export function SurgecastLogo({ size = 22, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
      <path d="M12 1.6c.5 0 1 .2 1.4.6l8.4 8.4c.8.8.8 2 0 2.8l-8.4 8.4c-.8.8-2 .8-2.8 0l-8.4-8.4c-.8-.8-.8-2 0-2.8l8.4-8.4c.4-.4.9-.6 1.4-.6Zm0 2.3L3.9 12 12 20.1l8.1-8.1L12 3.9Z" />
      <path d="M6.6 13.4c1.6-.1 2.5-1 3.3-2.3.9-1.4 1.9-2.6 3.9-2.6 1.3 0 2.5.6 3.6 1.7l-1.2 1.2c-.7-.7-1.5-1.1-2.4-1.1-1.1 0-1.7.7-2.5 1.9-1 1.6-2.3 3-4.6 3.1l-.1-1.9Z" />
      <path d="M9.2 16.2c1.4-.2 2.4-1 3.2-2.1.6-.8 1.2-1.3 2-1.3.6 0 1.2.3 1.8.8l1-1.3-.1 3.4-3.3-.2.9-.9c-.2-.1-.3-.1-.4-.1-.3 0-.6.3-1 .8-1 1.4-2.4 2.6-4.4 2.8l.3-1.9Z" opacity=".55" />
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
