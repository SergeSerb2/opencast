import type { CommandInfo, Hotkey, KeyModifier } from "@opencast/protocol";
import { eventKey, shortcutKeys, shortcutLabel } from "../lib/keyboard";

/** macOS virtual key codes (Carbon kVK_*) for keys the recorder can produce. */
const MAC_KEY_CODES: Record<string, number> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  h: 4,
  g: 5,
  z: 6,
  x: 7,
  c: 8,
  v: 9,
  b: 11,
  q: 12,
  w: 13,
  e: 14,
  r: 15,
  y: 16,
  t: 17,
  "1": 18,
  "2": 19,
  "3": 20,
  "4": 21,
  "6": 22,
  "5": 23,
  "=": 24,
  "9": 25,
  "7": 26,
  "-": 27,
  "8": 28,
  "0": 29,
  "]": 30,
  o: 31,
  u: 32,
  "[": 33,
  i: 34,
  p: 35,
  return: 36,
  l: 37,
  j: 38,
  "'": 39,
  k: 40,
  ";": 41,
  "\\": 42,
  ",": 43,
  "/": 44,
  n: 45,
  m: 46,
  ".": 47,
  tab: 48,
  space: 49,
  "`": 50,
  delete: 51,
  escape: 53,
  f17: 64,
  f18: 79,
  f19: 80,
  f20: 90,
  f5: 96,
  f6: 97,
  f7: 98,
  f3: 99,
  f8: 100,
  f9: 101,
  f11: 103,
  f13: 105,
  f16: 106,
  f14: 107,
  f10: 109,
  f12: 111,
  f15: 113,
  home: 115,
  pageUp: 116,
  deleteForward: 117,
  f4: 118,
  end: 119,
  f2: 120,
  pageDown: 121,
  f1: 122,
  arrowLeft: 123,
  arrowRight: 124,
  arrowDown: 125,
  arrowUp: 126,
};

/** Combinations macOS keeps for itself; registering them silently fails or breaks system features. */
const SYSTEM_SHORTCUTS: { modifiers: KeyModifier[]; key: string; owner: string }[] = [
  { modifiers: ["cmd"], key: "space", owner: "Spotlight" },
  { modifiers: ["cmd", "opt"], key: "space", owner: "Finder search window" },
  { modifiers: ["ctrl"], key: "space", owner: "Input Sources" },
  { modifiers: ["cmd"], key: "tab", owner: "the App Switcher" },
  { modifiers: ["cmd", "shift"], key: "3", owner: "Screenshot" },
  { modifiers: ["cmd", "shift"], key: "4", owner: "Screenshot" },
  { modifiers: ["cmd", "shift"], key: "5", owner: "Screenshot" },
];

const MODIFIER_KEYS = new Set(["Meta", "Control", "Alt", "Shift", "CapsLock", "Fn", "OS"]);

function modifiersOf(event: Pick<KeyboardEvent, "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): KeyModifier[] {
  const modifiers: KeyModifier[] = [];
  if (event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("opt");
  if (event.shiftKey) modifiers.push("shift");
  if (event.metaKey) modifiers.push("cmd");
  return modifiers;
}

export type RecordedKey = { kind: "hotkey"; hotkey: Hotkey } | { kind: "modifiers"; modifiers: KeyModifier[] } | { kind: "needs-modifier"; key: string };

/**
 * Interpret a keydown while recording. Plain modifier presses report the held
 * modifiers (shown live); other keys need at least one modifier unless they
 * are function keys, which macOS lets apps bind on their own.
 */
export function recordKey(event: Pick<KeyboardEvent, "code" | "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): RecordedKey {
  const modifiers = modifiersOf(event);
  if (MODIFIER_KEYS.has(event.key)) return { kind: "modifiers", modifiers };
  const key = eventKey(event);
  const functionKey = /^f([1-9]|1\d|20)$/.test(key);
  const onlyShift = modifiers.length === 1 && modifiers[0] === "shift";
  if ((!modifiers.length || onlyShift) && !functionKey) return { kind: "needs-modifier", key };
  const keyCode = MAC_KEY_CODES[key];
  return { kind: "hotkey", hotkey: keyCode === undefined ? { modifiers, key } : { modifiers, key, keyCode } };
}

function normalizedModifiers(modifiers: readonly KeyModifier[]): string {
  return [...new Set(modifiers.map((m) => (m === "alt" ? "opt" : m)))].sort().join("+");
}

export function sameHotkey(a: Hotkey | undefined | null, b: Hotkey | undefined | null): boolean {
  if (!a || !b) return false;
  return a.key.toLowerCase() === b.key.toLowerCase() && normalizedModifiers(a.modifiers) === normalizedModifiers(b.modifiers) && Boolean(a.hyper) === Boolean(b.hyper);
}

/** Keycap glyphs, e.g. ["⌥", "Space"]; a Hyper hotkey shows "✦" instead of ⌃⌥⇧⌘. */
export function hotkeyGlyphs(hotkey: Hotkey): string[] {
  if (hotkey.hyper) return ["✦", ...shortcutKeys({ modifiers: [], key: hotkey.key })];
  return shortcutKeys({ modifiers: hotkey.modifiers, key: hotkey.key });
}

export function hotkeyLabel(hotkey: Hotkey): string {
  return hotkey.hyper ? `Hyper ${shortcutLabel({ modifiers: [], key: hotkey.key })}` : shortcutLabel({ modifiers: hotkey.modifiers, key: hotkey.key });
}

/** The opencast-wide hotkey is stored as a setting, command hotkeys on commands. */
export const GLOBAL_HOTKEY_OWNER = "global";

/**
 * Who already uses `hotkey`: another command, the OpenCast hotkey, or the
 * system. `ownerId` is the command (or GLOBAL_HOTKEY_OWNER) being edited.
 */
export function findHotkeyConflict(hotkey: Hotkey, ownerId: string, commands: readonly Pick<CommandInfo, "id" | "title" | "hotkey">[], globalHotkey: Hotkey | null): string | null {
  const system = SYSTEM_SHORTCUTS.find((s) => sameHotkey(hotkey, { modifiers: s.modifiers, key: s.key }));
  if (system) return `Used by ${system.owner}`;
  if (ownerId !== GLOBAL_HOTKEY_OWNER && sameHotkey(hotkey, globalHotkey)) return "Used by the OpenCast Hotkey";
  const command = commands.find((c) => c.id !== ownerId && sameHotkey(hotkey, c.hotkey));
  return command ? `Already used by “${command.title}”` : null;
}
