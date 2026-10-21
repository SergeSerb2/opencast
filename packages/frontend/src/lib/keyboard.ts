import type { KeyboardShortcut, KeyModifier } from "@opencast/protocol";

const MODIFIER_ORDER: KeyModifier[] = ["ctrl", "opt", "alt", "shift", "cmd", "windows"];
const MODIFIER_GLYPH: Record<KeyModifier, string> = { ctrl: "⌃", opt: "⌥", alt: "⌥", shift: "⇧", cmd: "⌘", windows: "⊞" };

const KEY_GLYPH: Record<string, string> = {
  return: "↵",
  enter: "↵",
  tab: "⇥",
  escape: "Esc",
  esc: "Esc",
  delete: "⌫",
  backspace: "⌫",
  deleteforward: "⌦",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
  home: "↖",
  end: "↘",
  pageup: "⇞",
  pagedown: "⇟",
  capslock: "⇪",
};

/** Keycap labels for a shortcut: one per modifier (⌃ ⌥ ⇧ ⌘ order), then the key. */
export function shortcutKeys(shortcut: KeyboardShortcut): string[] {
  const mods = MODIFIER_ORDER.filter((m) => shortcut.modifiers.includes(m) && !(m === "alt" && shortcut.modifiers.includes("opt"))).map((m) => MODIFIER_GLYPH[m]);
  return [...mods, keyLabel(shortcut.key)];
}

export function keyLabel(key: string): string {
  const glyph = KEY_GLYPH[key.toLowerCase()];
  if (glyph) return glyph;
  if (/^f\d{1,2}$/i.test(key)) return key.toUpperCase();
  return key.length === 1 ? key.toUpperCase() : key;
}

/** Accessible text, e.g. "Command Shift K". */
export function shortcutLabel(shortcut: KeyboardShortcut): string {
  const names: Record<string, string> = { ctrl: "Control", opt: "Option", alt: "Option", shift: "Shift", cmd: "Command", windows: "Windows" };
  return [...MODIFIER_ORDER.filter((m) => shortcut.modifiers.includes(m)).map((m) => names[m]), keyLabel(shortcut.key)].join(" ");
}

const CODE_TO_KEY: Record<string, string> = {
  Enter: "return",
  NumpadEnter: "return",
  Tab: "tab",
  Escape: "escape",
  Backspace: "delete",
  Delete: "deleteForward",
  Space: "space",
  ArrowUp: "arrowUp",
  ArrowDown: "arrowDown",
  ArrowLeft: "arrowLeft",
  ArrowRight: "arrowRight",
  Home: "home",
  End: "end",
  PageUp: "pageUp",
  PageDown: "pageDown",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

/**
 * Layout-independent key name for an event, in Raycast `KeyEquivalent` terms.
 * Uses `event.code` so ⌥/⇧ combinations still report the base key.
 */
export function eventKey(event: Pick<KeyboardEvent, "code" | "key">): string {
  const { code } = event;
  if (code in CODE_TO_KEY) return CODE_TO_KEY[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

function normalizeKey(key: string): string {
  const k = key.toLowerCase();
  if (k === "enter") return "return";
  if (k === "backspace") return "delete";
  if (k === "esc") return "escape";
  return k;
}

export function matchesShortcut(event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, shortcut: KeyboardShortcut): boolean {
  const mods = shortcut.modifiers;
  if (event.metaKey !== mods.includes("cmd")) return false;
  if (event.ctrlKey !== mods.includes("ctrl")) return false;
  if (event.altKey !== (mods.includes("opt") || mods.includes("alt"))) return false;
  if (event.shiftKey !== mods.includes("shift")) return false;
  return normalizeKey(eventKey(event)) === normalizeKey(shortcut.key);
}

/** Shortcut helper: `sc("cmd", "shift", "k")`. */
export function sc(...parts: string[]): KeyboardShortcut {
  const key = parts[parts.length - 1];
  return { modifiers: parts.slice(0, -1) as KeyModifier[], key };
}

export type NavigationBindings = "macos" | "emacs" | "vim";
export type NavigationIntent = "up" | "down" | "left" | "right" | "pageUp" | "pageDown";

/** Map a key event to a list/grid movement for the user's navigation bindings. */
export function navigationIntent(event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">, bindings: NavigationBindings): NavigationIntent | null {
  const key = eventKey(event);
  const plain = !event.metaKey && !event.ctrlKey && !event.altKey;
  if (plain && !event.shiftKey) {
    if (key === "arrowUp") return "up";
    if (key === "arrowDown") return "down";
    if (key === "pageUp") return "pageUp";
    if (key === "pageDown") return "pageDown";
  }
  if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    if (bindings === "emacs") {
      if (key === "p") return "up";
      if (key === "n") return "down";
      if (key === "b") return "left";
      if (key === "f") return "right";
    }
    if (bindings === "vim") {
      if (key === "k") return "up";
      if (key === "j") return "down";
      if (key === "h") return "left";
      if (key === "l") return "right";
    }
  }
  return null;
}
