import type { Hotkey } from "@surgecast/protocol";
/** Shipped window-half shortcuts. Explicit command preferences override these. */
export function builtinHotkey(id: string, preset: "improved" | "original"): Hotkey | undefined {
  const keys: Record<string, string> = {
    "builtin:windowManagement.leftHalf": "arrowLeft",
    "builtin:windowManagement.rightHalf": "arrowRight",
    "builtin:windowManagement.topHalf": "arrowUp",
    "builtin:windowManagement.bottomHalf": "arrowDown",
  };
  const key = keys[id];
  if (!key) return undefined;
  return { modifiers: preset === "improved" ? ["ctrl", "opt", "cmd"] : ["ctrl", "opt"], key };
}
