import { memo, useMemo, type CSSProperties } from "react";
import type { ImageLike } from "@opencast/protocol";
import { ActionButton, ListItemRow, LoadingBar, Shortcut, Tag, type ListItemProps } from "../../../components";
import { MenuGlyph, OpenCastLogo } from "../../../icons/glyphs";
import { sc } from "../../../lib/keyboard";
import { ThemeScope } from "../../../theme/ThemeProvider";
import type { Palette } from "../../../theme/palettes";
import { previewCssVars } from "./live-preview";
import "./theme-studio.css";

const tile = (glyph: string, top: string, bottom: string): ImageLike => ({ tile: { glyph, background: [top, bottom] } });

const ROWS: (ListItemProps & { id: string })[] = [
  { id: "clipboard", title: "Clipboard History", subtitle: "Clipboard", icon: tile("clipboard-16", "#FFA24A", "#F2711C"), accessories: [{ alias: "ch" }, { text: "Command" }] },
  { id: "chat", title: "AI Chat", subtitle: "OpenCast AI", icon: tile("speech-bubble-16", "#FF7BC1", "#E2408F"), accessories: [{ text: "Command" }] },
  { id: "theme", title: "Switch Theme", subtitle: "OpenCast", icon: tile("brush-16", "#B58CFF", "#8156F0"), accessories: [{ tag: { value: "New", color: "raycast-purple" } }, { text: "Command" }] },
  { id: "calendar", title: "My Schedule", subtitle: "Calendar", icon: tile("calendar-16", "#FF6B6B", "#E5383B"), accessories: [{ text: "Command" }] },
];

const TAGS = [
  ["Red", "raycast-red"],
  ["Orange", "raycast-orange"],
  ["Yellow", "raycast-yellow"],
  ["Green", "raycast-green"],
  ["Blue", "raycast-blue"],
  ["Purple", "raycast-purple"],
  ["Magenta", "raycast-magenta"],
] as const;

const noop = () => undefined;

/**
 * A static, scaled-down launcher drawn with `palette`: header, a list with a
 * selected row, tags in every support color and the footer pills. The subtree
 * is its own `.theme-root`, so the real tokens and components pick up the colors.
 */
export const ThemeMiniLauncher = memo(function ThemeMiniLauncher({ palette, showLoader = false }: { palette: Palette; showLoader?: boolean }) {
  const style = useMemo(() => previewCssVars(palette) as CSSProperties, [palette]);
  const attrs = palette.appearance === "dark" ? { dark: "" } : { light: "" };
  return (
    <ThemeScope appearance={palette.appearance}>
      <div className="theme-root sc-theme-mini" {...attrs} style={style} aria-label={`Preview of ${palette.name}`} role="img">
        <div className="sc-theme-mini__window">
          <LoadingBar loading={showLoader} delay={0} />
          <div className="sc-theme-mini__header">
            <OpenCastLogo size={22} className="sc-theme-mini__logo" />
            <span className="sc-theme-mini__placeholder">Search for apps and commands…</span>
            <span className="sc-theme-mini__hint">
              Quick AI <Shortcut shortcut={sc("tab")} size="medium" />
            </span>
          </div>
          <div className="sc-theme-mini__list">
            <div className="sc-list-section sc-theme-mini__section">
              <span className="sc-list-section__title">Favorites</span>
            </div>
            {ROWS.map((item, index) => (
              <div key={item.id} className="sc-theme-mini__row">
                <ListItemRow item={item} domId={`sc-theme-mini-${item.id}`} selected={index === 0} size="large" onMouseDown={noop} onClick={noop} onDoubleClick={noop} />
              </div>
            ))}
            <div className="sc-list-section sc-theme-mini__section">
              <span className="sc-list-section__title">Support Colors</span>
            </div>
            <div className="sc-theme-mini__tags">
              {TAGS.map(([label, color]) => (
                <Tag key={label} color={color}>
                  {label}
                </Tag>
              ))}
            </div>
          </div>
          <div className="sc-theme-mini__footer">
            <span className="sc-theme-mini__pill sc-theme-mini__pill--round">
              <MenuGlyph size={18} className="sc-theme-mini__menu" />
            </span>
            <span className="sc-theme-mini__pill">
              <ActionButton title="Open Command" shortcut={sc("return")} tabIndex={-1} />
              <ActionButton variant="secondary" title="Actions" shortcut={sc("cmd", "k")} tabIndex={-1} />
            </span>
          </div>
        </div>
      </div>
    </ThemeScope>
  );
});
