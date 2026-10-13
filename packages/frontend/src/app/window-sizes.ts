import type { WindowKind } from "@opencast/protocol";

/** Default native window sizes in points (docs/ARCHITECTURE.md → Windows). */
export const WINDOW_SIZES: Record<WindowKind, { width: number; height: number }> = {
  main: { width: 750, height: 475 },
  "ai-chat": { width: 900, height: 640 },
  notes: { width: 420, height: 520 },
  settings: { width: 860, height: 620 },
  welcome: { width: 800, height: 560 },
  "theme-studio": { width: 900, height: 620 },
};
