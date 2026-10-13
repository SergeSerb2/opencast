import { describe, expect, it } from "vitest";
import { eventKey, matchesShortcut, navigationIntent, sc, shortcutKeys } from "../lib/keyboard";

const ev = (code: string, key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ code, key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });

describe("shortcut formatting", () => {
  it("orders modifiers ⌃ ⌥ ⇧ ⌘ and maps special keys", () => {
    expect(shortcutKeys(sc("cmd", "shift", "ctrl", "opt", "v"))).toEqual(["⌃", "⌥", "⇧", "⌘", "V"]);
    expect(shortcutKeys(sc("cmd", "return"))).toEqual(["⌘", "↵"]);
    expect(shortcutKeys(sc("tab"))).toEqual(["⇥"]);
    expect(shortcutKeys(sc("ctrl", "backspace"))).toEqual(["⌃", "⌫"]);
  });
});

describe("shortcut matching", () => {
  it("uses physical keys so ⌥ combinations still match", () => {
    expect(eventKey(ev("KeyK", "˚"))).toBe("k");
    expect(matchesShortcut(ev("KeyK", "k", { metaKey: true }), sc("cmd", "k"))).toBe(true);
    expect(matchesShortcut(ev("KeyK", "k", { metaKey: true, shiftKey: true }), sc("cmd", "k"))).toBe(false);
    expect(matchesShortcut(ev("Enter", "Enter", { metaKey: true }), sc("cmd", "enter"))).toBe(true);
    expect(matchesShortcut(ev("Backspace", "Backspace", { ctrlKey: true }), sc("ctrl", "backspace"))).toBe(true);
  });
});

describe("navigation bindings", () => {
  it("maps arrows always and ctrl keys per binding", () => {
    expect(navigationIntent(ev("ArrowDown", "ArrowDown"), "macos")).toBe("down");
    expect(navigationIntent(ev("KeyN", "n", { ctrlKey: true }), "emacs")).toBe("down");
    expect(navigationIntent(ev("KeyP", "p", { ctrlKey: true }), "emacs")).toBe("up");
    expect(navigationIntent(ev("KeyJ", "j", { ctrlKey: true }), "vim")).toBe("down");
    expect(navigationIntent(ev("KeyJ", "j", { ctrlKey: true }), "emacs")).toBeNull();
    expect(navigationIntent(ev("KeyN", "n", { ctrlKey: true }), "macos")).toBeNull();
    expect(navigationIntent(ev("PageDown", "PageDown"), "macos")).toBe("pageDown");
  });
});
