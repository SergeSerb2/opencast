import { useCallback, useEffect, useState } from "react";
import type { RunningAppInfo } from "@opencast/protocol";
import { useNativeEvent } from "../../../bridge/hooks";
import { native } from "../../../bridge/native";

/**
 * The app that was frontmost before the launcher opened: paste actions target
 * it and name it in their titles ("Paste to Safari"), like Raycast.
 */
export function usePasteTarget(): RunningAppInfo | null {
  const [app, setApp] = useState<RunningAppInfo | null>(null);
  const refresh = useCallback(() => {
    native
      .call("apps.previous")
      .then(setApp)
      .catch(() => setApp(null));
  }, []);
  useEffect(refresh, [refresh]);
  useNativeEvent("window.didShow", (event) => {
    if (event.kind === "main") refresh();
  });
  return app;
}

/** "Paste to Safari", or "Paste to Active App" when the target is unknown. */
export function pasteTitle(app: RunningAppInfo | null, prefix = "Paste"): string {
  return `${prefix} to ${app?.name ?? "Active App"}`;
}

/** Finder icon of the paste target for action rows. */
export function pasteIcon(app: RunningAppInfo | null) {
  return app ? { fileIcon: app.path } : "clipboard-16";
}
