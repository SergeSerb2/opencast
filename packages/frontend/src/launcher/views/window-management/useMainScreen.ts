import { useEffect, useState } from "react";
import type { ScreenInfo } from "@surgecast/protocol";
import { native } from "../../../bridge/native";

/**
 * The display the preview draws: full frame plus the visible frame (without
 * menu bar and Dock), in AppKit coordinates (origin at the bottom left).
 */
export interface PreviewScreen {
  name?: string;
  frame: ScreenInfo["frame"];
  visibleFrame: ScreenInfo["visibleFrame"];
}

/** 16:10 with a menu bar, used until (or unless) the host reports a real display. */
export const FALLBACK_SCREEN: PreviewScreen = {
  frame: { x: 0, y: 0, width: 1600, height: 1000 },
  visibleFrame: { x: 0, y: 0, width: 1600, height: 968 },
};

/** Menu bar and Dock areas as fractions of the full frame. */
export function screenInsets({ frame, visibleFrame: v }: PreviewScreen): { top: number; right: number; bottom: number; left: number } {
  const clamp = (value: number, total: number) => Math.min(Math.max(value / total, 0), 0.5);
  return {
    top: clamp(frame.y + frame.height - (v.y + v.height), frame.height),
    bottom: clamp(v.y - frame.y, frame.height),
    left: clamp(v.x - frame.x, frame.width),
    right: clamp(frame.x + frame.width - (v.x + v.width), frame.width),
  };
}

/** Main display from the native host; the 16:10 fallback in a browser. */
export function useMainScreen(): PreviewScreen {
  const [screen, setScreen] = useState<PreviewScreen>(FALLBACK_SCREEN);
  useEffect(() => {
    let cancelled = false;
    native
      .call("windows.screens")
      .then((screens) => {
        const main = screens.find((s) => s.isMain) ?? screens[0];
        if (!cancelled && main && main.frame.width > 0 && main.frame.height > 0) setScreen({ name: main.name, frame: main.frame, visibleFrame: main.visibleFrame });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return screen;
}
