import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { getEnv } from "../bridge/env";
import { useBackend, useNativeEvent } from "../bridge/hooks";
import { native } from "../bridge/native";
import { useSettings } from "../bridge/settings";
import { resolvePalette, type Palette } from "./palettes";
import { cssVarsToRule, paletteToCssVars } from "./theme-vars";

export type Appearance = "dark" | "light";

interface ThemeContextValue {
  appearance: Appearance;
  palette: Palette;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STYLE_ID = "sc-active-theme";
const ACTIVE_SELECTOR = ":root.theme-root.active-theme";

function initialSystemAppearance(): Appearance {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function useSystemAppearance(): Appearance {
  const [appearance, setAppearance] = useState<Appearance>(initialSystemAppearance);
  useEffect(() => {
    if (native.available) {
      native.call("system.appearance").then(setAppearance, () => undefined);
      return;
    }
    const query = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!query) return;
    const onChange = () => setAppearance(query.matches ? "light" : "dark");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useNativeEvent("appearance.changed", ({ appearance: next }) => setAppearance(next));
  return appearance;
}

/** Root attributes shared by every window: appearance, macOS version, host. */
export function applyRootAttributes(root: HTMLElement, appearance: Appearance): void {
  const env = getEnv();
  root.classList.add("theme-root", "active-theme");
  root.toggleAttribute("dark", appearance === "dark");
  root.toggleAttribute("light", appearance === "light");
  root.setAttribute("macos", String(env.macOSMajor >= 27 ? 27 : 26));
  root.toggleAttribute("native", env.native);
}

/**
 * Applies the active theme to `<html>`: appearance (setting, system, or the
 * dev `?appearance=` override), the selected palette for that appearance,
 * interface zoom, and window focus state.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const env = getEnv();
  const { settings } = useSettings();
  const system = useSystemAppearance();
  const setting = settings["general.appearance"];
  const appearance: Appearance = env.appearanceOverride ?? (setting === "system" ? system : setting);
  const { data: themes } = useBackend("themes.list", undefined);
  const paletteId = appearance === "dark" ? settings["general.themeDark"] : settings["general.themeLight"];
  const palette = useMemo(() => resolvePalette(paletteId, appearance, themes ?? []), [paletteId, appearance, themes]);
  const zoom = settings["general.uiZoom"];

  useLayoutEffect(() => {
    const root = document.documentElement;
    applyRootAttributes(root, appearance);
    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = cssVarsToRule(ACTIVE_SELECTOR, paletteToCssVars(palette));
  }, [appearance, palette]);

  useLayoutEffect(() => {
    const value = Number.isFinite(zoom) && zoom >= 0.8 && zoom <= 1.5 ? zoom : 1;
    document.documentElement.style.setProperty("--zoom", String(value));
  }, [zoom]);

  useNativeEvent("window.didResignKey", ({ kind }) => {
    if (kind === env.window) document.documentElement.setAttribute("window-blurred", "");
  });
  useNativeEvent("window.didBecomeKey", ({ kind }) => {
    if (kind === env.window) document.documentElement.removeAttribute("window-blurred");
  });

  const value = useMemo(() => ({ appearance, palette }), [appearance, palette]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Current appearance and palette. Outside a provider, reads the root attributes. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx;
  const appearance: Appearance = document.documentElement.hasAttribute("light") ? "light" : "dark";
  return { appearance, palette: resolvePalette(undefined, appearance) };
}

/** Provide a fixed appearance to a subtree (gallery, previews). The subtree must carry the theme-root attributes. */
export function ThemeScope({ appearance, children }: { appearance: Appearance; children: ReactNode }) {
  const value = useMemo(() => ({ appearance, palette: resolvePalette(undefined, appearance) }), [appearance]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
