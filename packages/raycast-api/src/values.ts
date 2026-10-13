export { Icon } from "./constants";
export const Color = {
  Blue: "raycast-blue", Green: "raycast-green", Magenta: "raycast-magenta", Orange: "raycast-orange",
  Purple: "raycast-purple", Red: "raycast-red", Yellow: "raycast-yellow", PrimaryText: "raycast-primary-text",
  SecondaryText: "raycast-secondary-text", Brown: { light: "#714426", dark: "#9F6138" },
} as const;
export const Image = { Mask: { Circle: "circle", RoundedRectangle: "roundedRectangle" } } as const;
export const ImageMask = Image.Mask;
const shortcut = (key: string, ...modifiers: string[]) => ({ key, modifiers });
export const Keyboard = { Shortcut: {
  Common: {
    Copy: shortcut("c", "cmd", "shift"), CopyDeeplink: shortcut("c", "cmd", "shift"), CopyName: shortcut("c", "cmd", "opt"),
    CopyPath: shortcut("c", "cmd", "ctrl"), Save: shortcut("s", "cmd"), Duplicate: shortcut("d", "cmd"), Edit: shortcut("e", "cmd"),
    MoveDown: shortcut("arrowDown", "cmd", "opt"), MoveUp: shortcut("arrowUp", "cmd", "opt"), New: shortcut("n", "cmd"),
    Open: shortcut("o", "cmd"), OpenWith: shortcut("o", "cmd", "shift"), Pin: shortcut(".", "cmd"), Refresh: shortcut("r", "cmd"),
    Remove: shortcut("x", "ctrl"), RemoveAll: shortcut("x", "ctrl", "shift"), ToggleQuickLook: shortcut("y", "cmd"),
  },
} };
export const specialKeys = { return: "\r", delete: "⌫", backspace: "⌫", deleteForward: "⌦", tab: "⇥", arrowUp: "↑", arrowDown: "↓", arrowLeft: "←", arrowRight: "→", pageUp: "⇞", pageDown: "⇟", home: "↖", end: "↘", space: " ", escape: "⎋", enter: "↵" };
const reservedShortcuts = [shortcut("w", "cmd"), shortcut("delete"), shortcut("deleteForward"), shortcut("delete", "cmd"), shortcut("delete", "opt"), shortcut("escape"), shortcut("k", "cmd"), shortcut(",", "cmd"), shortcut("p", "cmd"), shortcut("/", "shift", "cmd"), shortcut("enter"), shortcut("q", "cmd"), shortcut("escape", "cmd"), shortcut("enter", "cmd"), shortcut("a", "cmd")];
export function allowedShortcut(value: any): any {
  if (!value) return value;
  const selected = value.macOS ?? value;
  if (!Array.isArray(selected.modifiers) || typeof selected.key !== "string") throw new Error("Invalid keyboard shortcut");
  const normalize = (input: any) => `${input.key.toLowerCase().replace(/^return$/, "enter")}:${input.modifiers.map((x: string) => x.toLowerCase().replace(/^alt$/, "opt").replace(/^windows$/, "cmd")).sort().join(",")}`;
  return reservedShortcuts.some((x) => normalize(x) === normalize(selected)) ? undefined : selected;
}
