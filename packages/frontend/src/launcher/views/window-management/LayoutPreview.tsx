import type { CSSProperties } from "react";
import type { WindowLayoutRect } from "@surgecast/protocol";
import { formatPercent } from "./geometry";
import { screenInsets, type PreviewScreen } from "./useMainScreen";

const pct = (fraction: number) => `${fraction * 100}%`;

/**
 * Miniature of the display — wallpaper, menu bar, Dock — with the window a
 * layout produces. Rect fractions are relative to the visible frame.
 */
export function LayoutPreview({ rect, screen, label }: { rect: WindowLayoutRect; screen: PreviewScreen; label?: string }) {
  const insets = screenInsets(screen);
  const visible: CSSProperties = { top: pct(insets.top), right: pct(insets.right), bottom: pct(insets.bottom), left: pct(insets.left) };
  const window: CSSProperties = { left: pct(rect.x), top: pct(rect.y), width: pct(rect.width), height: pct(rect.height) };
  const overflows = rect.x < 0 || rect.y < 0 || rect.x + rect.width > 1.00005 || rect.y + rect.height > 1.00005;
  return (
    <figure className="sc-wm-preview">
      <div className="sc-wm-preview__display" style={{ aspectRatio: `${screen.frame.width} / ${screen.frame.height}` }}>
        <div className="sc-wm-preview__wallpaper" aria-hidden="true" />
        {insets.top > 0 && <div className="sc-wm-preview__menubar" style={{ height: pct(insets.top) }} aria-hidden="true" />}
        {insets.bottom > 0 && <div className="sc-wm-preview__dock" style={{ height: pct(insets.bottom * 0.8) }} aria-hidden="true" />}
        <div className="sc-wm-preview__visible" style={visible}>
          <div className="sc-wm-preview__window" data-overflow={overflows || undefined} style={window} role="img" aria-label={`Window at ${formatPercent(rect.x)}%, ${formatPercent(rect.y)}%, ${formatPercent(rect.width)}% wide, ${formatPercent(rect.height)}% tall`}>
            <span className="sc-wm-preview__titlebar" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="sc-wm-preview__size" aria-hidden="true">
              {formatPercent(rect.width)}% × {formatPercent(rect.height)}%
            </span>
          </div>
        </div>
      </div>
      {label && <figcaption className="sc-wm-preview__label sc-truncate">{label}</figcaption>}
    </figure>
  );
}

/** "Built-in Retina Display · 1512 × 982" when the host reported the display. */
export function screenLabel(screen: PreviewScreen): string | undefined {
  if (!screen.name) return undefined;
  return `${screen.name} · ${Math.round(screen.frame.width)} × ${Math.round(screen.frame.height)}`;
}
