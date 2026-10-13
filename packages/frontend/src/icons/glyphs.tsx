import { useId, type SVGProps } from "react";

/** Surgecast's own glyphs, drawn on a 24×24 grid like lucide (stroke = currentColor). */

type GlyphProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: GlyphProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

/** The Surgecast mark: a rounded diamond with a wave cut through it. */
export function SurgecastLogo({ size = 22, ...rest }: GlyphProps) {
  const id = `sc-logo-${useId().replace(/:/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <path d="M10.2 2.9a2.6 2.6 0 0 1 3.6 0l7.3 7.3a2.6 2.6 0 0 1 0 3.6l-7.3 7.3a2.6 2.6 0 0 1-3.6 0l-7.3-7.3a2.6 2.6 0 0 1 0-3.6z" fill="#fff" />
          <path d="M5.6 13.6c1.6 0 2.4-1.2 3.2-2.4.8-1.2 1.6-2.4 3.2-2.4s2.4 1.2 3.2 2.4c.8 1.2 1.6 2.4 3.2 2.4" fill="none" stroke="#000" strokeWidth="2.1" strokeLinecap="round" />
        </mask>
      </defs>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${id})`} />
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
