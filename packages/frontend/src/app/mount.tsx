import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "../theme/tokens.css";
import "../theme/base.css";
import "../theme/glass.css";
import { getEnv } from "../bridge/env";
import { installNativeReceiver } from "../bridge/native";
import { applyRootAttributes, ThemeProvider } from "../theme/ThemeProvider";
import { AlertHost } from "../components/AlertDialog/AlertDialog";
import { OverlayRoot } from "../components/Popover/Popover";
import { DevBackdrop } from "./DevBackdrop";

/** Enable CSS transitions two frames after first paint (spec §11.1 "Boot"). */
function enableTransitionsSoon(): void {
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add("transitions-ready")));
}

/**
 * Boot a Surgecast window page: install the native event receiver, set root
 * attributes before the first render (no theme flash), and render `app`
 * inside the theme provider and, in a plain browser, the dev backdrop.
 */
export function mountWindow(app: ReactNode, options: { backdrop?: boolean } = {}): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("mountWindow: #root not found");
  const { backdrop = true } = options;
  installNativeReceiver();
  const env = getEnv();
  const initial = env.appearanceOverride ?? (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
  applyRootAttributes(document.documentElement, initial);
  document.documentElement.dataset.window = env.window;
  createRoot(container).render(
    <StrictMode>
      <ThemeProvider>
        {backdrop ? (
          <DevBackdrop>
            {app}
            <OverlayRoot />
            <AlertHost />
          </DevBackdrop>
        ) : (
          <>
            {app}
            <OverlayRoot />
            <AlertHost />
          </>
        )}
      </ThemeProvider>
    </StrictMode>,
  );
  enableTransitionsSoon();
}
