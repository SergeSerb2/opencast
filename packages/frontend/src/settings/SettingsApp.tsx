import { useEffect, useMemo } from "react";
import { getEnv } from "../bridge/env";
import { useBackend, useNativeEvent } from "../bridge/hooks";
import { native } from "../bridge/native";
import { FloatingToastHost } from "../components/Toast/InlineToast";
import { extensionPages } from "./catalog";
import { normalizeRoute, useSettingsNavigation } from "./navigation";
import { PageForRoute } from "./pages";
import { Sidebar } from "./Sidebar";
import { PromptHost } from "./ui/prompt";
import "./settings.css";

function isEditable(element: Element | null): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable);
}

/** Window-level keys: ⌘[ / ⌘] history, ⌘F search, ⌘W and Esc close the window. */
function useSettingsKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const nav = useSettingsNavigation.getState();
      const command = event.metaKey && !event.ctrlKey && !event.altKey;
      if (command && event.key === "[") {
        event.preventDefault();
        nav.back_();
      } else if (command && event.key === "]") {
        event.preventDefault();
        nav.forward_();
      } else if (command && event.key.toLowerCase() === "f") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-settings-search]")?.focus();
      } else if ((command && event.key.toLowerCase() === "w") || (event.key === "Escape" && !isEditable(document.activeElement) && !document.querySelector(".sc-popover, .sc-s-dialog, .sc-alert"))) {
        event.preventDefault();
        void native.call("window.hide", { kind: getEnv().window }).catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** The Settings window: sidebar + one page, routed by `window.route` and in-app links. */
export function SettingsApp() {
  const route = useSettingsNavigation((s) => s.current);
  const navigateTo = useSettingsNavigation((s) => s.navigate);
  const { data: extensions } = useBackend("extensions.list", undefined);
  const installed = useMemo(() => extensionPages(extensions ?? []), [extensions]);

  useNativeEvent("window.route", ({ kind, route: target }) => {
    if (kind === getEnv().window && target) navigateTo(normalizeRoute(target));
  });
  useSettingsKeys();

  return (
    <div className="sc-s-window">
      <Sidebar route={route} installed={installed} />
      <main className="sc-s-main">
        <PageForRoute key={route} route={route} />
      </main>
      <PromptHost />
      <FloatingToastHost />
    </div>
  );
}
