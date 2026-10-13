import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { getEnv } from "../bridge/env";
import { native } from "../bridge/native";
import { DEV_CONTENT_HEIGHT_EVENT, DEV_HUD_EVENT, DEV_VISIBILITY_EVENT } from "../bridge/native-mock";
import { WINDOW_SIZES } from "./window-sizes";
import "./dev-backdrop.css";

function useWindowEvent<T>(name: string, fn: (detail: T) => void): void {
  useEffect(() => {
    const listener = (event: Event) => fn((event as CustomEvent<T>).detail);
    window.addEventListener(name, listener);
    return () => window.removeEventListener(name, listener);
  });
}

function DevHud() {
  const [hud, setHud] = useState<{ text: string; key: number } | null>(null);
  useWindowEvent<{ text: string }>(DEV_HUD_EVENT, ({ text }) => setHud({ text, key: Date.now() }));
  useEffect(() => {
    if (!hud) return;
    const timer = setTimeout(() => setHud(null), 1600);
    return () => clearTimeout(timer);
  }, [hud]);
  if (!hud) return null;
  return (
    <div key={hud.key} className="sc-dev-hud sc-glass-panel" role="status">
      {hud.text}
    </div>
  );
}

/**
 * Browser-only stand-in for the native window: a wallpaper and a rounded glass
 * window at the native size, so the page looks like the app when developing
 * and in screenshots. Inside the Swift host it renders children untouched.
 */
export function DevBackdrop({ children }: { children: ReactNode }) {
  const env = getEnv();
  const size = WINDOW_SIZES[env.window];
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);

  useWindowEvent<{ height: number }>(DEV_CONTENT_HEIGHT_EVENT, ({ height }) => setContentHeight(height));
  useWindowEvent<{ visible: boolean }>(DEV_VISIBILITY_EVENT, ({ visible: next }) => setVisible(next));

  useEffect(() => {
    if (visible || env.native) return;
    // ⌥Space brings the window back, like the global hotkey.
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey && event.code === "Space") {
        event.preventDefault();
        void native.call("window.show", { kind: env.window });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, env.native, env.window]);

  if (env.native) return <>{children}</>;

  const style = {
    "--dev-window-width": `${size.width}px`,
    "--dev-window-height": `${contentHeight ?? size.height}px`,
    "--dev-window-full-height": `${size.height}px`,
  } as CSSProperties;

  return (
    <div className="sc-dev-backdrop" data-window={env.window} style={style}>
      <div className="sc-dev-window" data-window={env.window} data-hidden={!visible || undefined}>
        {children}
      </div>
      {!visible && (
        <button type="button" className="sc-dev-reopen" onClick={() => void native.call("window.show", { kind: env.window })}>
          Window hidden — click or press ⌥Space to show it again
        </button>
      )}
      <DevHud />
    </div>
  );
}
